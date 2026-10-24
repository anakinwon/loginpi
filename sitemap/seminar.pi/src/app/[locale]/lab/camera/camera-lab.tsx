'use client'
// M0 카메라 실험실 — ① 기능 지원 확인 ② 카메라·마이크 켜기와 미리보기 ③ 같은 방 코드의 기기 2대 직접 연결(P2P, 서버 없음)
// 시그널링 = Supabase Realtime broadcast(cafe.pi 음성채널과 같은 방식, 테이블 미사용). offer 는 항상 id 가 작은 쪽이 보낸다(동시 입장 충돌 방지)
// iOS WebView 교훈(cafe.pi PRD_9 사례 #1) : 영상 요소는 숨기지 않고 playsInline, 재생 실패 시 '탭하여 재생' 버튼
import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'

const ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }] // ponytail: STUN 만 — 같은 Wi-Fi 기준, LTE·방화벽은 TURN(M2)
const STATS_MS = 2000

type Signal =
  | { type: 'hello'; from: string }
  | { type: 'offer' | 'answer'; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; from: string; to: string; candidate: RTCIceCandidateInit }

type Stats = { width?: number; height?: number; fps?: number; rttMs?: number; route?: string }

export function CameraLab({ signalUrl, signalKey }: { signalUrl?: string; signalKey?: string }) {
  const localRef = useRef<HTMLVideoElement>(null)
  const remoteRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const chRef = useRef<RealtimeChannel | null>(null)
  const pendingIce = useRef<RTCIceCandidateInit[]>([])
  const [myId] = useState(() => Math.random().toString(36).slice(2, 10))
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [camInfo, setCamInfo] = useState('')
  const [localPlay, setLocalPlay] = useState('')
  const [room, setRoom] = useState(() => String(1000 + Math.floor(Math.random() * 9000)))
  const [connState, setConnState] = useState('')
  const [remotePlay, setRemotePlay] = useState('')
  const [needTap, setNeedTap] = useState(false)
  const [stats, setStats] = useState<Stats>({})
  const [log, setLog] = useState<string[]>([])

  const add = (m: string) => setLog((l) => [...l, `${new Date().toLocaleTimeString()} ${m}`].slice(-60))

  // ① 기능 지원 — 렌더 중 window 접근을 피하려고 마운트 후 계산
  const [support, setSupport] = useState<Record<string, boolean>>({})
  useEffect(() => {
    setSupport({
      secureContext: window.isSecureContext,
      mediaDevices: !!navigator.mediaDevices?.getUserMedia,
      RTCPeerConnection: typeof RTCPeerConnection !== 'undefined',
    })
    // 화면을 떠나면 연결·카메라·마이크 모두 정리(표시등이 남지 않게)
    return () => {
      leave()
      stopCamera()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ② 카메라 켜기 — 성공하면 실제 해상도·fps 기록, 미리보기 재생 결과 기록
  async function startCamera(next = facing) {
    stopCamera()
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: next, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      })
      streamRef.current = s
      const v = s.getVideoTracks()[0]?.getSettings()
      setCamInfo(`성공 ${v?.width}x${v?.height} ${v?.frameRate ?? '?'}fps · 마이크 ${s.getAudioTracks().length ? '있음' : '없음'}`)
      add(`카메라 성공 ${v?.width}x${v?.height}`)
      const el = localRef.current!
      el.srcObject = s
      await el.play().then(
        () => setLocalPlay('자동재생 OK'),
        (e: Error) => setLocalPlay(`자동재생 실패 : ${e.name}`),
      )
      // 연결 중이면 보내는 트랙 교체(전·후면 전환)
      const sender = pcRef.current?.getSenders().find((x) => x.track?.kind === 'video')
      if (sender) await sender.replaceTrack(s.getVideoTracks()[0])
    } catch (e) {
      const err = e as Error
      setCamInfo(`실패 : ${err.name} — ${err.message}`)
      add(`카메라 실패 ${err.name}`)
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (localRef.current) localRef.current.srcObject = null
  }

  async function flip() {
    const next = facing === 'user' ? 'environment' : 'user'
    setFacing(next)
    await startCamera(next)
  }

  // ③ 기기 2대 연결
  function send(msg: Signal) {
    void chRef.current?.send({ type: 'broadcast', event: 'sig', payload: msg })
  }

  function makePc(peer: string) {
    const pc = new RTCPeerConnection({ iceServers: ICE })
    pcRef.current = pc
    streamRef.current?.getTracks().forEach((t) => pc.addTrack(t, streamRef.current!))
    pc.onicecandidate = (e) => e.candidate && send({ type: 'ice', from: myId, to: peer, candidate: e.candidate.toJSON() })
    pc.onconnectionstatechange = () => {
      setConnState(pc.connectionState)
      add(`연결 상태 ${pc.connectionState}`)
    }
    pc.ontrack = (e) => {
      const el = remoteRef.current!
      if (el.srcObject !== e.streams[0]) {
        el.srcObject = e.streams[0]
        el.play().then(
          () => {
            setRemotePlay('상대 영상 재생 OK')
            setNeedTap(false)
          },
          (err: Error) => {
            setRemotePlay(`상대 영상 자동재생 실패 : ${err.name}`)
            setNeedTap(true)
          },
        )
      }
    }
    return pc
  }

  async function flushIce(pc: RTCPeerConnection) {
    for (const c of pendingIce.current.splice(0)) await pc.addIceCandidate(c).catch(() => {})
  }

  async function onSignal(m: Signal) {
    if (m.from === myId || ('to' in m && m.to !== myId)) return
    if (m.type === 'hello') {
      if (alive()) return // 2명 시험 — 살아 있는 연결이 있으면 무시
      if (myId > m.from) {
        add('상대 입장 → id 작은 쪽이 offer 하도록 hello 회신')
        return send({ type: 'hello', from: myId })
      }
      add('상대 입장 → offer 보냄')
      closePc()
      const pc = makePc(m.from)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      send({ type: 'offer', from: myId, to: m.from, sdp: offer })
    } else if (m.type === 'offer') {
      add('offer 받음 → answer 보냄')
      closePc() // 상대 새로고침·재입장 — 새 offer 는 항상 새 연결로 받는다
      const pc = makePc(m.from)
      await pc.setRemoteDescription(m.sdp)
      await flushIce(pc)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      send({ type: 'answer', from: myId, to: m.from, sdp: answer })
    } else if (m.type === 'answer') {
      add('answer 받음')
      await pcRef.current?.setRemoteDescription(m.sdp)
      if (pcRef.current) await flushIce(pcRef.current)
    } else if (m.type === 'ice') {
      const pc = pcRef.current
      if (pc?.remoteDescription) await pc.addIceCandidate(m.candidate).catch(() => {})
      else pendingIce.current.push(m.candidate)
    }
  }

  function join() {
    if (!signalUrl || !signalKey) return add('시그널링 env 미설정 — 기기 2대 연결 불가')
    if (!streamRef.current) return add('먼저 카메라를 켜세요')
    leave()
    const ch = createClient(signalUrl, signalKey).channel(`lab-camera:${room}`, {
      config: { broadcast: { self: false } },
    })
    chRef.current = ch
    ch.on('broadcast', { event: 'sig' }, ({ payload }) => void onSignal(payload as Signal)).subscribe((st) => {
      add(`방 ${room} ${st}`)
      if (st === 'SUBSCRIBED') send({ type: 'hello', from: myId })
    })
  }

  // 연결이 살아 있나 — 끊김·실패·닫힘이면 재입장 hello 에 새 연결을 만든다
  function alive() {
    const st = pcRef.current?.connectionState
    return !!st && st !== 'failed' && st !== 'disconnected' && st !== 'closed'
  }

  // 핸들러를 먼저 떼고 닫는다 — 닫힌 뒤 오는 상태 이벤트가 화면 상태를 덮어쓰지 않게
  function closePc() {
    const pc = pcRef.current
    if (!pc) return
    pc.onicecandidate = pc.ontrack = pc.onconnectionstatechange = null
    pc.close()
    pcRef.current = null
    pendingIce.current = []
    if (remoteRef.current) remoteRef.current.srcObject = null
  }

  function leave() {
    closePc()
    if (chRef.current) void chRef.current.unsubscribe()
    chRef.current = null
    setConnState('')
  }

  // 연결 품질 — 받는 영상 해상도·fps, 왕복 지연, 경로(host·srflx·relay)
  useEffect(() => {
    const t = setInterval(async () => {
      const pc = pcRef.current
      if (!pc) return
      const r = await pc.getStats()
      const s: Stats = {}
      let localCand = ''
      r.forEach((x) => {
        if (x.type === 'inbound-rtp' && x.kind === 'video') {
          s.width = x.frameWidth
          s.height = x.frameHeight
          s.fps = x.framesPerSecond
        }
        if (x.type === 'candidate-pair' && x.nominated && x.state === 'succeeded') {
          s.rttMs = x.currentRoundTripTime != null ? Math.round(x.currentRoundTripTime * 1000) : undefined
          localCand = x.localCandidateId
        }
      })
      if (localCand) s.route = r.get(localCand)?.candidateType
      setStats(s)
    }, STATS_MS)
    return () => clearInterval(t)
  }, [])

  const report = [
    `seminar.pi M0 결과 ${new Date().toISOString()}`,
    `UA ${typeof navigator !== 'undefined' ? navigator.userAgent : ''}`,
    `지원 ${JSON.stringify(support)}`,
    `카메라 ${camInfo || '미시험'} · 미리보기 ${localPlay || '-'}`,
    `연결 ${connState || '미시험'} · ${remotePlay || '-'}`,
    `품질 ${stats.width ?? '-'}x${stats.height ?? '-'} ${stats.fps ?? '-'}fps rtt ${stats.rttMs ?? '-'}ms 경로 ${stats.route ?? '-'}`,
  ].join('\n')

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report)
      add('결과 복사됨')
    } catch {
      add('복사 실패 — 아래 결과 칸을 길게 눌러 복사하세요')
    }
  }

  const btn = 'rounded-md border border-neutral-700 px-3 py-2 text-sm active:bg-neutral-800 disabled:opacity-40'
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">M0 카메라 실험실</h1>
        <p className="text-muted-foreground text-sm">Pi Browser 카메라·자동재생·기기 2대 직접 연결 점검 (PRD_01 M0)</p>
      </header>

      <section className="space-y-1 text-sm">
        <h2 className="font-semibold">① 기능 지원</h2>
        {Object.entries(support).map(([k, v]) => (
          <p key={k}>
            {v ? '✅' : '❌'} {k}
          </p>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">② 카메라·마이크</h2>
        <div className="flex flex-wrap gap-2">
          <button className={btn} onClick={() => void startCamera()}>
            카메라 켜기
          </button>
          <button className={btn} onClick={() => void flip()} disabled={!camInfo.startsWith('성공')}>
            전·후면 전환
          </button>
          <button className={btn} onClick={stopCamera}>
            끄기
          </button>
        </div>
        <p className="text-sm">
          {camInfo} {localPlay && `· ${localPlay}`}
        </p>
        <video ref={localRef} playsInline muted autoPlay className="aspect-video w-full rounded-md bg-black" />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">③ 기기 2대 연결 (같은 방 코드, 같은 Wi-Fi 권장)</h2>
        {!signalUrl || !signalKey ? (
          <p className="text-sm text-amber-400">시그널링 env(NEXT_PUBLIC_LAB_SUPABASE_*) 미설정 — 이 단계는 비활성</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={room}
            onChange={(e) => setRoom(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            className="w-24 rounded-md border border-neutral-700 bg-transparent px-2 py-2 text-sm"
            aria-label="방 코드"
          />
          <button className={btn} onClick={join}>
            입장
          </button>
          <button className={btn} onClick={leave}>
            나가기
          </button>
        </div>
        <p className="text-sm">
          {connState && `연결 ${connState}`} {remotePlay && `· ${remotePlay}`}
        </p>
        <p className="text-muted-foreground text-xs">
          받는 영상 {stats.width ?? '-'}x{stats.height ?? '-'} · {stats.fps ?? '-'}fps · 왕복 {stats.rttMs ?? '-'}ms · 경로 {stats.route ?? '-'}
        </p>
        {needTap && (
          <button className={btn} onClick={() => void remoteRef.current?.play().then(() => setNeedTap(false))}>
            탭하여 상대 영상 재생
          </button>
        )}
        <video ref={remoteRef} playsInline autoPlay className="aspect-video w-full rounded-md bg-black" />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">결과 (TROUBLESHOOT 기록용)</h2>
        <button className={btn} onClick={() => void copyReport()}>
          결과 복사
        </button>
        <textarea readOnly value={report} className="h-32 w-full rounded-md border border-neutral-700 bg-transparent p-2 text-xs" />
        <pre className="text-muted-foreground max-h-48 overflow-auto text-xs">{log.join('\n')}</pre>
      </section>
    </div>
  )
}
