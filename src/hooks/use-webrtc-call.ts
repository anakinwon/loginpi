'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase-client'
import { piFetch } from '@/lib/pi-fetch'

export type CallState = 'idle' | 'ringing_out' | 'ringing_in' | 'connected' | 'ended'

export interface IncomingCall {
  call_id: string
  caller_usr_id: string
  caller_nm: string
}

export interface CallStats {
  rtt_ms?: number
  packet_loss_pct?: number
  jitter_ms?: number
  relay_yn: 'Y' | 'N'
}

interface UseWebrtcCallOptions {
  roomId: string
  currentUserId: string
  onCallEnded?: () => void
}

const RINGING_TIMEOUT_MS = 30_000

export function useWebrtcCall({ roomId, currentUserId, onCallEnded }: UseWebrtcCallOptions) {
  const [callState, setCallState] = useState<CallState>('idle')
  const [activeCallId, setActiveCallId] = useState<string | null>(null)
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [isMuted, setIsMuted] = useState(false)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const ringingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabaseClient>['channel']> | null>(null)
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── 정리 ──────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (ringingTimerRef.current) clearTimeout(ringingTimerRef.current)
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current)
    pcRef.current?.close()
    pcRef.current = null
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    setRemoteStream(null)
    setActiveCallId(null)
    setIncomingCall(null)
    setCallState('ended')
    onCallEnded?.()
    setTimeout(() => setCallState('idle'), 1500)
  }, [onCallEnded])

  // ─── 품질 수집 ─────────────────────────────────────────────────────────────
  const collectStats = useCallback(async (): Promise<CallStats> => {
    const pc = pcRef.current
    if (!pc) return { relay_yn: 'N' }
    try {
      const reports = await pc.getStats()
      let rtt: number | undefined
      let loss: number | undefined
      let jitter: number | undefined
      let relayDetected = false

      reports.forEach(r => {
        if (r.type === 'remote-inbound-rtp' && r.kind === 'audio') {
          rtt = r.roundTripTime !== undefined ? Math.round(r.roundTripTime * 1000) : undefined
          loss = r.fractionLost !== undefined ? +(r.fractionLost * 100).toFixed(2) : undefined
          jitter = r.jitter !== undefined ? +(r.jitter * 1000).toFixed(2) : undefined
        }
        if (r.type === 'candidate-pair' && r.state === 'succeeded') {
          const local = reports.get(r.localCandidateId)
          if (local?.candidateType === 'relay') relayDetected = true
        }
      })
      return { rtt_ms: rtt, packet_loss_pct: loss, jitter_ms: jitter, relay_yn: relayDetected ? 'Y' : 'N' }
    } catch {
      return { relay_yn: 'N' }
    }
  }, [])

  // ─── RTCPeerConnection 생성 ────────────────────────────────────────────────
  const createPc = useCallback(async (callId: string) => {
    const credsRes = await piFetch('/api/voice/turn-credentials', { method: 'POST' })
    const { iceServers } = (await credsRes.json()) as { iceServers: RTCIceServer[] }

    const pc = new RTCPeerConnection({ iceServers })
    pcRef.current = pc

    pc.ontrack = e => setRemoteStream(e.streams[0])

    // ICE candidate → 시그널링 서버로 중계
    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return
      piFetch(`/api/chat/rooms/${roomId}/call/${callId}/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'webrtc_candidate', payload: { candidate } }),
      })
    }

    // 연결 끊김 → ICE restart
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected') {
        pc.restartIce()
      } else if (pc.connectionState === 'failed') {
        endCall(callId, 'FAILED')
      }
    }

    return pc
  }, [roomId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 로컬 마이크 ───────────────────────────────────────────────────────────
  const getLocalStream = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    })
    localStreamRef.current = stream
    return stream
  }, [])

  // ─── 통화 종료 ─────────────────────────────────────────────────────────────
  const endCall = useCallback(async (callId: string, reason: 'USER_ENDED' | 'TIMEOUT' | 'REJECTED' | 'FAILED' = 'USER_ENDED') => {
    const stats = await collectStats()
    await piFetch(`/api/chat/rooms/${roomId}/call/${callId}/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ end_rsn_cd: reason, ...stats }),
    })
    cleanup()
  }, [roomId, collectStats, cleanup])

  // ─── 발신 ──────────────────────────────────────────────────────────────────
  const startCall = useCallback(async (calleeUsrId: string) => {
    if (callState !== 'idle') return
    setCallState('ringing_out')

    try {
      const res = await piFetch(`/api/chat/rooms/${roomId}/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callee_usr_id: calleeUsrId }),
      })
      if (!res.ok) { cleanup(); return }

      const { call_id } = (await res.json()) as { call_id: string }
      setActiveCallId(call_id)

      // 30초 타임아웃
      ringingTimerRef.current = setTimeout(() => endCall(call_id, 'TIMEOUT'), RINGING_TIMEOUT_MS)

      // offer 생성 (로컬 트랙 추가 후)
      const [stream, pc] = await Promise.all([getLocalStream(), createPc(call_id)])
      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      await piFetch(`/api/chat/rooms/${roomId}/call/${call_id}/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'webrtc_offer', payload: { sdp: offer } }),
      })
    } catch {
      cleanup()
    }
  }, [callState, roomId, getLocalStream, createPc, endCall, cleanup])

  // ─── 수신 응답 ─────────────────────────────────────────────────────────────
  const answerCall = useCallback(async () => {
    if (!incomingCall) return
    const { call_id } = incomingCall
    if (ringingTimerRef.current) clearTimeout(ringingTimerRef.current)
    setCallState('connected')
    setActiveCallId(call_id)

    try {
      const [stream, pc] = await Promise.all([getLocalStream(), createPc(call_id)])
      stream.getTracks().forEach(t => pc.addTrack(t, stream))
      setIncomingCall(null)
    } catch {
      endCall(call_id, 'FAILED')
    }
  }, [incomingCall, getLocalStream, createPc, endCall])

  // ─── 거절 ──────────────────────────────────────────────────────────────────
  const rejectCall = useCallback(async () => {
    if (!incomingCall) return
    await endCall(incomingCall.call_id, 'REJECTED')
    setIncomingCall(null)
  }, [incomingCall, endCall])

  // ─── 뮤트 토글 ────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
    setIsMuted(m => !m)
  }, [])

  // ─── 시그널링 수신 (Supabase Realtime broadcast) ───────────────────────────
  useEffect(() => {
    const supabase = getSupabaseClient()
    // 통화 시그널링 전용 토픽 — useChatRoom의 `room:{id}`와 토픽 공유 금지.
    // supabase-js는 같은 토픽의 채널 인스턴스를 재사용하므로, 공유 시 이미 subscribe된
    // 인스턴스가 반환되어 useChatRoom의 presence .on()이 throw된다. (서버: broadcastToCall)
    const ch = supabase.channel(`room:${roomId}:call`)
    channelRef.current = ch

    ch
      .on('broadcast', { event: 'call_invite' }, ({ payload }) => {
        // 자기 자신이 발신한 초대는 무시
        if (payload.callee_usr_id !== currentUserId) return
        if (callState !== 'idle') return
        setIncomingCall({ call_id: payload.call_id, caller_usr_id: payload.caller_usr_id, caller_nm: payload.caller_nm })
        setCallState('ringing_in')
        ringingTimerRef.current = setTimeout(() => {
          setIncomingCall(null)
          setCallState('idle')
        }, RINGING_TIMEOUT_MS)
      })
      .on('broadcast', { event: 'webrtc_offer' }, async ({ payload }) => {
        const pc = pcRef.current
        if (!pc || payload.from_usr_id === currentUserId) return
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        await piFetch(`/api/chat/rooms/${roomId}/call/${payload.call_id}/signal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'webrtc_answer', payload: { sdp: answer } }),
        })
        setCallState('connected')
      })
      .on('broadcast', { event: 'webrtc_answer' }, async ({ payload }) => {
        const pc = pcRef.current
        if (!pc || payload.from_usr_id === currentUserId) return
        if (ringingTimerRef.current) clearTimeout(ringingTimerRef.current)
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
        setCallState('connected')
      })
      .on('broadcast', { event: 'webrtc_candidate' }, async ({ payload }) => {
        const pc = pcRef.current
        if (!pc || payload.from_usr_id === currentUserId) return
        try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)) } catch { /* 무시 */ }
      })
      .on('broadcast', { event: 'call_hangup' }, ({ payload }) => {
        // 상대방이 먼저 끊은 경우
        if (payload.from_usr_id === currentUserId) return
        cleanup()
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [roomId, currentUserId, callState, cleanup])

  return {
    callState,
    activeCallId,
    incomingCall,
    remoteStream,
    isMuted,
    startCall,
    answerCall,
    rejectCall,
    endCall: (reason?: 'USER_ENDED' | 'TIMEOUT' | 'REJECTED' | 'FAILED') =>
      activeCallId ? endCall(activeCallId, reason) : Promise.resolve(),
    toggleMute,
  }
}
