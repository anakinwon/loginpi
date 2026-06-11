'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase-client'
import { piFetch } from '@/lib/pi-fetch'

// PiVoice™ v2.0 — N:N Full Mesh 음성채널 훅 (PRD_9_VOICE_CHAT v2.0)
// 1명도 입장 가능(혼자 대기), 신규 입장자가 기존 피어 전원에게 offer를 보내 glare 차단.
// 방장 mic_mute_force 수신 시 클라이언트가 자가 mute (서버는 미디어를 직접 제어하지 않음).

export type VoiceState = 'idle' | 'joining' | 'joined'

export interface VoiceParticipant {
  usr_id: string
  display_nm: string
  mic_yn: 'Y' | 'N'
}

interface VoiceStats {
  rtt_ms?: number
  packet_loss_pct?: number
  jitter_ms?: number
  relay_yn: 'Y' | 'N'
}

interface UseVoiceChannelOptions {
  roomId: string
  currentUserId: string
}

export function useVoiceChannel({
  roomId,
  currentUserId,
}: UseVoiceChannelOptions) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [participants, setParticipants] = useState<VoiceParticipant[]>([])
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(
    new Map(),
  )
  const [isMuted, setIsMuted] = useState(false) // 본인 자가 음소거 (로컬)
  const [micAllowed, setMicAllowed] = useState(true) // 서버 mic_yn — 방장 강제/4명 제한

  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  // setRemoteDescription 전에 도착한 ICE candidate 보관 큐 (피어별)
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(
    new Map(),
  )
  const localStreamRef = useRef<MediaStream | null>(null)
  const iceServersRef = useRef<RTCIceServer[]>([])
  const joinedRef = useRef(false)
  const isMutedRef = useRef(false)
  const micAllowedRef = useRef(true)

  // ─── 시그널 송신 (서버 중계 — 신원 보증) ────────────────────────────────────
  const sendSignal = useCallback(
    (
      event: 'webrtc_offer' | 'webrtc_answer' | 'webrtc_candidate',
      toUsrId: string,
      payload: object,
    ) =>
      piFetch(`/api/voice/rooms/${roomId}/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, to_usr_id: toUsrId, payload }),
      }),
    [roomId],
  )

  // ─── 로컬 마이크 track 활성 상태 동기화 ─────────────────────────────────────
  // 송출 = 서버 허용(micAllowed) AND 본인이 음소거하지 않음(!isMuted)
  const syncLocalTrack = useCallback(() => {
    const enabled = micAllowedRef.current && !isMutedRef.current
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = enabled
    })
  }, [])

  // ─── 피어 연결 생성 ─────────────────────────────────────────────────────────
  const createPeer = useCallback(
    (peerUsrId: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current })
      pcsRef.current.set(peerUsrId, pc)

      const stream = localStreamRef.current
      if (stream) stream.getTracks().forEach((t) => pc.addTrack(t, stream))

      pc.ontrack = (e) => {
        setRemoteStreams((prev) => {
          const next = new Map(prev)
          next.set(peerUsrId, e.streams[0])
          return next
        })
      }

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) sendSignal('webrtc_candidate', peerUsrId, { candidate })
      }

      // Wi-Fi↔LTE 전환 등 일시 단절 → ICE restart로 자동 복구 시도
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected') pc.restartIce()
      }

      return pc
    },
    [sendSignal],
  )

  const closePeer = useCallback((peerUsrId: string) => {
    pcsRef.current.get(peerUsrId)?.close()
    pcsRef.current.delete(peerUsrId)
    pendingCandidatesRef.current.delete(peerUsrId)
    setRemoteStreams((prev) => {
      const next = new Map(prev)
      next.delete(peerUsrId)
      return next
    })
  }, [])

  // ─── 품질 수집 (전체 피어 평균, 릴레이는 1곳이라도 경유 시 'Y') ─────────────
  const collectStats = useCallback(async (): Promise<VoiceStats> => {
    const rtts: number[] = []
    const losses: number[] = []
    const jitters: number[] = []
    let relayDetected = false

    for (const pc of pcsRef.current.values()) {
      try {
        const reports = await pc.getStats()
        reports.forEach((r) => {
          if (r.type === 'remote-inbound-rtp' && r.kind === 'audio') {
            if (r.roundTripTime !== undefined) rtts.push(r.roundTripTime * 1000)
            if (r.fractionLost !== undefined) losses.push(r.fractionLost * 100)
            if (r.jitter !== undefined) jitters.push(r.jitter * 1000)
          }
          if (r.type === 'candidate-pair' && r.state === 'succeeded') {
            const local = reports.get(r.localCandidateId)
            if (local?.candidateType === 'relay') relayDetected = true
          }
        })
      } catch {
        /* 통계 수집 실패는 무시 */
      }
    }

    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : undefined
    const rtt = avg(rtts)
    const loss = avg(losses)
    const jitter = avg(jitters)
    return {
      rtt_ms: rtt !== undefined ? Math.round(rtt) : undefined,
      packet_loss_pct: loss !== undefined ? +loss.toFixed(2) : undefined,
      jitter_ms: jitter !== undefined ? +jitter.toFixed(2) : undefined,
      relay_yn: relayDetected ? 'Y' : 'N',
    }
  }, [])

  // ─── 정리 ──────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    pcsRef.current.forEach((pc) => pc.close())
    pcsRef.current.clear()
    pendingCandidatesRef.current.clear()
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    setRemoteStreams(new Map())
    joinedRef.current = false
    isMutedRef.current = false
    micAllowedRef.current = true
    setIsMuted(false)
    setMicAllowed(true)
    setVoiceState('idle')
  }, [])

  // ─── 입장 — 1명도 가능 (혼자 대기) ──────────────────────────────────────────
  const join = useCallback(async () => {
    if (joinedRef.current || voiceState === 'joining') return
    setVoiceState('joining')

    try {
      // TURN 자격증명 + 입장 등록 병렬
      const [credsRes, joinRes] = await Promise.all([
        piFetch('/api/voice/turn-credentials', { method: 'POST' }),
        piFetch(`/api/voice/rooms/${roomId}/join`, { method: 'POST' }),
      ])
      if (!joinRes.ok) {
        setVoiceState('idle')
        return
      }
      const { iceServers } = (await credsRes.json()) as {
        iceServers: RTCIceServer[]
      }
      const { mic_yn, participants: list } = (await joinRes.json()) as {
        mic_yn: 'Y' | 'N'
        participants: VoiceParticipant[]
      }
      iceServersRef.current = iceServers
      micAllowedRef.current = mic_yn === 'Y'
      setMicAllowed(mic_yn === 'Y')
      setParticipants(list)

      // 청취 전용이어도 마이크 권한은 확보 (방장 unmute 시 즉시 송출 가능)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })
      localStreamRef.current = stream
      syncLocalTrack()

      joinedRef.current = true
      setVoiceState('joined')

      // 신규 입장자(나)가 기존 피어 전원에게 offer — 단방향 개시 규칙으로 glare 차단
      const peers = list.filter((p) => p.usr_id !== currentUserId)
      await Promise.all(
        peers.map(async (peer) => {
          const pc = createPeer(peer.usr_id)
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          await sendSignal('webrtc_offer', peer.usr_id, { sdp: offer })
        }),
      )
    } catch {
      cleanup()
    }
  }, [
    voiceState,
    roomId,
    currentUserId,
    createPeer,
    sendSignal,
    syncLocalTrack,
    cleanup,
  ])

  // ─── 퇴장 ──────────────────────────────────────────────────────────────────
  const leave = useCallback(async () => {
    if (!joinedRef.current) return
    const stats = await collectStats()
    cleanup()
    await piFetch(`/api/voice/rooms/${roomId}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stats),
    })
  }, [roomId, collectStats, cleanup])

  // ─── 본인 음소거 토글 (로컬) ────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    isMutedRef.current = !isMutedRef.current
    setIsMuted(isMutedRef.current)
    syncLocalTrack()
  }, [syncLocalTrack])

  // ─── 방장 원격 마이크 제어 (UI에서 OWNER/ADMIN만 노출 — 서버가 재검증) ──────
  const controlMic = useCallback(
    async (targetUsrId: string, action: 'mute' | 'unmute') => {
      const res = await piFetch(`/api/voice/rooms/${roomId}/mic-control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_usr_id: targetUsrId, action }),
      })
      return res.ok
    },
    [roomId],
  )

  // ─── 시그널링 수신 ──────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = getSupabaseClient()
    // 통화 전용 토픽 — useChatRoom의 `room:{id}`와 분리 (채널 인스턴스 재사용 충돌 방지)
    const ch = supabase.channel(`room:${roomId}:call`)

    const flushPendingCandidates = async (
      peerUsrId: string,
      pc: RTCPeerConnection,
    ) => {
      const pending = pendingCandidatesRef.current.get(peerUsrId) ?? []
      pendingCandidatesRef.current.delete(peerUsrId)
      for (const c of pending) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(c))
        } catch {
          /* 무시 */
        }
      }
    }

    ch.on('broadcast', { event: 'call_participant_join' }, ({ payload }) => {
      // 참여자 현황은 미입장 상태에서도 갱신 (채널 점유 표시용)
      setParticipants(payload.participants ?? [])
      // 기존 피어(나)는 신규 입장자의 offer를 기다린다 — 여기서 연결을 만들지 않음
    })
      .on('broadcast', { event: 'call_participant_leave' }, ({ payload }) => {
        setParticipants(payload.participants ?? [])
        if (joinedRef.current && payload.usr_id !== currentUserId)
          closePeer(payload.usr_id)
      })
      .on('broadcast', { event: 'webrtc_offer' }, async ({ payload }) => {
        if (!joinedRef.current || payload.to_usr_id !== currentUserId) return
        // 신규 입장자가 보낸 offer — 기존 피어(나)가 answer로 응답
        closePeer(payload.from_usr_id) // 재협상 시 기존 연결 정리
        const pc = createPeer(payload.from_usr_id)
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
        await flushPendingCandidates(payload.from_usr_id, pc)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        await sendSignal('webrtc_answer', payload.from_usr_id, { sdp: answer })
      })
      .on('broadcast', { event: 'webrtc_answer' }, async ({ payload }) => {
        if (!joinedRef.current || payload.to_usr_id !== currentUserId) return
        const pc = pcsRef.current.get(payload.from_usr_id)
        if (!pc) return
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
        await flushPendingCandidates(payload.from_usr_id, pc)
      })
      .on('broadcast', { event: 'webrtc_candidate' }, async ({ payload }) => {
        if (!joinedRef.current || payload.to_usr_id !== currentUserId) return
        const pc = pcsRef.current.get(payload.from_usr_id)
        if (!pc || !pc.remoteDescription) {
          // remote description 전 도착 — 큐에 보관 후 flush
          const queue =
            pendingCandidatesRef.current.get(payload.from_usr_id) ?? []
          queue.push(payload.candidate)
          pendingCandidatesRef.current.set(payload.from_usr_id, queue)
          return
        }
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate))
        } catch {
          /* 무시 */
        }
      })
      .on('broadcast', { event: 'mic_mute_force' }, ({ payload }) => {
        setParticipants(payload.participants ?? [])
        if (payload.target_usr_id === currentUserId) {
          micAllowedRef.current = false
          setMicAllowed(false)
          syncLocalTrack()
        }
      })
      .on('broadcast', { event: 'mic_unmute_allow' }, ({ payload }) => {
        setParticipants(payload.participants ?? [])
        if (payload.target_usr_id === currentUserId) {
          micAllowedRef.current = true
          setMicAllowed(true)
          syncLocalTrack()
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [roomId, currentUserId, createPeer, closePeer, sendSignal, syncLocalTrack])

  // ─── 초기 참여자 현황 로드 (입장 전 점유 표시) ──────────────────────────────
  useEffect(() => {
    piFetch(`/api/voice/rooms/${roomId}/participants`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { participants: VoiceParticipant[] } | null) => {
        if (d) setParticipants(d.participants)
      })
      .catch(() => {})
  }, [roomId])

  // ─── 언마운트 시 퇴장 처리 (방 이탈 = 음성채널 퇴장) ────────────────────────
  useEffect(() => {
    return () => {
      if (joinedRef.current) {
        // 언마운트 중이라 await 불가 — keepalive fetch로 best-effort 퇴장
        piFetch(`/api/voice/rooms/${roomId}/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ relay_yn: 'N' }),
          keepalive: true,
        }).catch(() => {})
        pcsRef.current.forEach((pc) => pc.close())
        localStreamRef.current?.getTracks().forEach((t) => t.stop())
      }
    }
  }, [roomId])

  return {
    voiceState,
    participants,
    remoteStreams,
    isMuted,
    micAllowed,
    join,
    leave,
    toggleMute,
    controlMic,
  }
}
