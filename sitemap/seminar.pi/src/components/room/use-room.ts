'use client'
// 화상 방 연결 훅 — 입장권·TURN 발급 → 엔진 /signal(WebSocket) → 발행 PC(클라이언트 offer)·구독 PC(서버 offer, PRD_02 D-2).
// 봉투 {t,id,m,ok,d,e}·메시지 이름은 docs/SIGNAL_API.md v1.0 = media/internal/signal/envelope.go. 룸 화면(/s/[id]/join)과 실험실(/lab/sfu)이 같이 쓴다
import { useEffect, useRef, useState } from 'react'
import { piFetch } from '@pi/auth/client'

export type Role = 'presenter' | 'audience'
export type MediaKind = 'audio' | 'video'
export type RoomState = 'idle' | 'ticket' | 'connecting' | 'joined' | 'closed' | 'error'
type Env = { t: 'req' | 'res' | 'ntf'; id?: number; m?: string; ok?: boolean; d?: unknown; e?: { code: string; msg: string } }
type Trickle = { pc: 'pub' | 'sub'; candidate: RTCIceCandidateInit }
type Consumer = { consumerId: string; producerId: string; kind: MediaKind; mid: string; paused?: boolean }

const REQ_TIMEOUT_MS = 10000

// 엔진 응답 실패 — code 는 SIGNAL_API 5절 오류 코드(화면 문구 키로 쓴다). LEFT = 나가기로 취소된 요청
class SignalError extends Error {
  constructor(
    public code: string,
    msg: string,
  ) {
    super(`${code} ${msg}`)
  }
}

// 로그인 입장권 — 실패 사유는 HTTP 상태(401 미로그인·403 발표 권한 없음·503 서버 키 미설정) 또는 NETWORK·FORMAT
async function fetchTicket(room: string, role: Role): Promise<{ ticket?: string; why?: string }> {
  const r = await piFetch('/api/media/ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room, cap: role === 'presenter' ? 'present' : 'watch' }),
  }).catch(() => null)
  if (!r) return { why: 'NETWORK' }
  if (!r.ok) return { why: `${r.status}` }
  const j = (await r.json().catch(() => null)) as { ticket?: string } | null
  return j?.ticket ? { ticket: j.ticket } : { why: 'FORMAT' }
}

// TURN 단기 자격 증명(/api/media/turn) — 실패해도 입장은 진행(엔진이 준 STUN 만으로 시도)
async function fetchTurn(): Promise<RTCIceServer[]> {
  const r = await piFetch('/api/media/turn', { method: 'POST' }).catch(() => null)
  if (!r?.ok) return []
  const j = (await r.json().catch(() => null)) as { iceServers?: RTCIceServer[] } | null
  return j?.iceServers ?? []
}

export function useRoom({ wsUrl, onLog }: { wsUrl?: string; onLog?: (m: string) => void }) {
  const wsRef = useRef<WebSocket | null>(null)
  const pubRef = useRef<RTCPeerConnection | null>(null)
  const subRef = useRef<RTCPeerConnection | null>(null)
  const localRef = useRef<MediaStream | null>(null)
  // 응답 대기표 — 값은 응답(Env) 또는 null(나가기로 취소)을 받는 콜백. 콜백이 자기 타이머를 정리한다
  const pendingRef = useRef(new Map<number, (e: Env | null) => void>())
  const iceWait = useRef<{ pub: RTCIceCandidateInit[]; sub: RTCIceCandidateInit[] }>({ pub: [], sub: [] })
  const nextId = useRef(1)
  // 구독 PC 재협상 직렬 큐 — 서버 offer 가 연달아 와도 setRemoteDescription·answer 가 겹치지 않게 차례로 처리
  const subChain = useRef<Promise<void>>(Promise.resolve())
  // 세션 순번 — leave 때마다 증가. 늦게 끝난 이전 세션의 await·이벤트가 새 세션 상태를 덮지 않게 비교한다
  const seqRef = useRef(0)
  // 구독 대응표 — mid→트랙(ontrack), producerId→consumer(consumerCreated), 일시정지 producerId 집합(알림 도착 순서 무관)
  const tracksRef = useRef(new Map<string, MediaStreamTrack>())
  const consumersRef = useRef(new Map<string, Consumer>())
  const pausedRef = useRef(new Set<string>())
  const producersRef = useRef<Partial<Record<MediaKind, string>>>({})
  const [state, setState] = useState<RoomState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  // 원격 영상·소리는 종류별 스트림 — 소리 트랙이 붙어도 영상 요소 srcObject 가 바뀌지 않게(깜박임 방지)
  const [remoteVideo, setRemoteVideo] = useState<MediaStream | null>(null)
  const [remoteAudio, setRemoteAudio] = useState<MediaStream | null>(null)
  const [localOn, setLocalOn] = useState({ audio: false, video: false })
  const [remotePaused, setRemotePaused] = useState({ audio: false, video: false })
  const [pending, setPending] = useState<MediaKind | null>(null)
  // 토글 요청 중 여부 — 단축키 연타처럼 렌더 전에 다시 불릴 때 state 클로저 값은 믿을 수 없어 ref 로 막는다
  const busyRef = useRef(false)
  // 발행 거부(ROLE_FORBIDDEN) — 연결은 유지하고 화면은 청중으로 전환(설계서 7.3)
  const [forbidden, setForbidden] = useState(false)

  const log = (m: string) => onLog?.(m)

  useEffect(() => () => leave(), []) // eslint-disable-line react-hooks/exhaustive-deps

  function stopLocal() {
    localRef.current?.getTracks().forEach((t) => t.stop())
    localRef.current = null
    setLocalStream(null)
  }

  // 오류 화면으로 — leave 와 같은 전체 정리(WS·PC·원격 트랙 — 소리가 계속 나지 않게) 후 오류 코드만 남긴다
  function fail(code: string) {
    teardown()
    setError(code)
    setState('error')
  }

  function send(e: Env) {
    wsRef.current?.send(JSON.stringify(e))
  }

  function request<T>(m: string, d: unknown): Promise<T> {
    const id = nextId.current++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRef.current.delete(id)
        reject(new SignalError('TIMEOUT', `${m} 응답 없음`))
      }, REQ_TIMEOUT_MS)
      pendingRef.current.set(id, (e) => {
        clearTimeout(timer)
        if (!e) reject(new SignalError('LEFT', m))
        else if (e.ok) resolve(e.d as T)
        else reject(new SignalError(e.e?.code ?? 'INTERNAL', e.e?.msg ?? ''))
      })
      send({ t: 'req', id, m, d })
    })
  }

  // 종류별 트랙 구성이 실제로 바뀔 때만 화면용 스트림을 새로 만든다(같은 객체를 고치면 React 가 모름, 매번 만들면 영상이 깜박임)
  function syncTracks() {
    const live = [...tracksRef.current.values()].filter((t) => t.readyState === 'live')
    const pick = (k: MediaKind) => (prev: MediaStream | null) => {
      const ts = live.filter((t) => t.kind === k)
      const cur = prev?.getTracks() ?? []
      if (cur.length === ts.length && ts.every((t) => cur.includes(t))) return prev
      return ts.length ? new MediaStream(ts) : null
    }
    setRemoteVideo(pick('video'))
    setRemoteAudio(pick('audio'))
  }

  function syncPaused() {
    const cs = [...consumersRef.current.values()]
    const p = (k: MediaKind) => cs.some((c) => c.kind === k && pausedRef.current.has(c.producerId))
    setRemotePaused({ audio: p('audio'), video: p('video') })
  }

  function newPC(kind: 'pub' | 'sub', iceServers: RTCIceServer[], my: number) {
    const pc = new RTCPeerConnection({ iceServers })
    pc.onicecandidate = (ev) => {
      // trickle 은 응답이 필요 없어 ntf 로 보낸다(엔진 server.go TypeNtf 분기가 받음 — 설계서 8절)
      if (ev.candidate) send({ t: 'ntf', m: 'trickle', d: { pc: kind, candidate: ev.candidate.toJSON() } })
    }
    pc.onconnectionstatechange = () => {
      log(`${kind === 'pub' ? '발행' : '구독'} PC ${pc.connectionState}`)
      if (pc.connectionState === 'failed' && seqRef.current === my) fail('ICE_FAILED')
    }
    return pc
  }

  // remote SDP 전에 온 후보는 모아 두었다가 적용
  async function flushIce(kind: 'pub' | 'sub') {
    const pc = kind === 'pub' ? pubRef.current : subRef.current
    if (!pc?.remoteDescription) return
    for (const c of iceWait.current[kind].splice(0)) await pc.addIceCandidate(c).catch(() => {})
  }

  async function onNtf(e: Env) {
    if (e.m === 'trickle') {
      const tk = e.d as Trickle
      iceWait.current[tk.pc].push(tk.candidate)
      await flushIce(tk.pc)
    } else if (e.m === 'consumerCreated') {
      const c = e.d as Consumer
      consumersRef.current.set(c.producerId, c)
      if (c.paused) pausedRef.current.add(c.producerId)
      log(`구독 생성 ${c.kind} mid=${c.mid}`)
      syncPaused()
    } else if (e.m === 'producerPaused' || e.m === 'producerResumed') {
      const id = (e.d as { producerId: string }).producerId
      if (e.m === 'producerPaused') pausedRef.current.add(id)
      else pausedRef.current.delete(id)
      syncPaused()
    } else if (e.m === 'producerClosed') {
      const id = (e.d as { producerId: string }).producerId
      const c = consumersRef.current.get(id)
      if (c) tracksRef.current.delete(c.mid)
      consumersRef.current.delete(id)
      pausedRef.current.delete(id)
      syncTracks()
      syncPaused()
    } else if (e.m === 'transport.subscribe') {
      // 서버 offer → answer(구독 PC 재협상). 직렬 큐 — 앞 협상의 answer 송신이 끝난 뒤 다음 offer 를 적용한다
      const sdp = (e.d as { sdp: string }).sdp
      const my = seqRef.current
      const run = subChain.current.then(async () => {
        const pc = subRef.current
        if (!pc || seqRef.current !== my) return // 대기 중 나가기·재입장 — 이전 세션 offer 는 버린다
        await pc.setRemoteDescription({ type: 'offer', sdp })
        await flushIce('sub')
        const ans = await pc.createAnswer()
        await pc.setLocalDescription(ans)
        await request('transport.subscribe.answer', { sdp: ans.sdp })
        log('구독 offer 응답 완료')
      })
      // 실패해도 큐는 다음 offer 를 받는다(오류 로그는 호출부 onNtf catch)
      subChain.current = run.catch(() => {})
      await run
    } else if (e.m === 'error') {
      const er = e.d as { code: string; msg: string }
      log(`서버 오류 ${er.code} ${er.msg}`)
      fail(er.code)
    } else {
      log(`알림 ${e.m}`)
    }
  }

  // local : 스트림 = 그대로 발행 / null = 미디어 없이 입장(권한 거부 — 발행 안 함) / undefined = 여기서 카메라 요청(실험실)
  // devName = 실험실 개발용 입장(엔진 MEDIA_DEV_TICKET=1 만 통과)
  async function join(room: string, role: Role, local?: MediaStream | null, devName?: string) {
    if (!wsUrl) return fail('NO_ENGINE')
    teardown()
    const my = seqRef.current
    const stale = () => seqRef.current !== my
    // 넘겨받은 대기실 스트림은 지금부터 훅 소유 — 발행 전에 실패해도 leave·fail 이 끈다
    localRef.current = local ?? null
    setLocalStream(local ?? null)
    setError(null)
    setState('ticket')
    // 입장권(60초·1회용)·TURN 은 서로 독립 → 병렬(R-P1). 입장권은 WebSocket 열기 직전에 받는다
    const [tk, turn] = await Promise.all([fetchTicket(room, role), fetchTurn()])
    if (stale()) return // 발급 대기 중 나가기·재입장
    if (!tk.ticket && !devName) return fail(`TICKET_${tk.why}`)
    log(tk.ticket ? '입장권 발급됨' : `입장권 없음(${tk.why}) — 개발용 입장 시도(운영 엔진은 거부)`)
    log(`TURN ${turn.length ? '발급됨' : '없음(STUN 만)'}`)
    setState('connecting')
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    ws.onmessage = (ev) => {
      const e = JSON.parse(String(ev.data)) as Env
      if (e.t === 'res' && e.id != null) {
        pendingRef.current.get(e.id)?.(e)
        pendingRef.current.delete(e.id)
      } else if (e.t === 'req' && e.m === 'ping') {
        send({ t: 'res', id: e.id, ok: true, d: {} })
      } else if (e.t === 'ntf') {
        onNtf(e).catch((err: Error) => log(`알림 처리 실패 ${err.message}`))
      }
    }
    ws.onclose = () => {
      log('시그널링 끊김')
      if (stale()) return
      // 끊김도 전체 정리 — PC·원격 트랙이 남아 소리가 계속 나지 않게(fail 은 핸들러를 먼저 떼므로 여기 오지 않음)
      teardown()
      setState('closed')
    }
    try {
      // 연결 실패(터널 꺼짐·주소 오타·엔진 Origin 거부 403)도 로그에 남긴다
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve()
        ws.onerror = () => reject(new SignalError('WS_FAILED', 'WebSocket 연결 실패'))
      })
      if (stale()) return
      const res = await request<{ peerId: string; iceServers: RTCIceServer[]; producers: unknown[] }>(
        'join',
        tk.ticket ? { ticket: tk.ticket } : { room, role, name: devName },
      )
      if (stale()) return
      const ice = [...res.iceServers, ...turn]
      log(`입장 peer=${res.peerId} 기존 발행 ${res.producers.length}개`)
      // 구독 PC 는 모든 참가자에게 서버 offer 로 생긴다
      const sub = newPC('sub', ice, my)
      subRef.current = sub
      sub.ontrack = (ev) => {
        const key = ev.transceiver.mid ?? ev.track.id
        const track = ev.track
        // 재협상 때 같은 트랙으로 다시 오면 무시(스트림 재생성·영상 깜박임 방지)
        if (tracksRef.current.get(key) === track) return
        log(`수신 트랙 ${track.kind}`)
        tracksRef.current.set(key, track)
        // 트랙이 끝나면 표에서 빼고 화면 갱신 — 이전 세션·이미 바뀐 트랙이면 무시
        track.addEventListener('ended', () => {
          if (seqRef.current !== my || tracksRef.current.get(key) !== track) return
          tracksRef.current.delete(key)
          syncTracks()
        })
        syncTracks()
      }
      setState('joined')
      if (role === 'presenter') await publish(ice, local, my)
    } catch (e) {
      log(`입장 실패 ${(e as Error).message}`)
      if (stale()) return
      // ROLE_FORBIDDEN 은 연결 유지(SIGNAL_API 5절) — 발행만 접고 청중처럼 계속 본다(설계서 7.3)
      if (e instanceof SignalError && e.code === 'ROLE_FORBIDDEN') {
        setForbidden(true)
        return closePublish()
      }
      fail(e instanceof SignalError ? e.code : 'MEDIA_FAILED')
    }
  }

  async function publish(iceServers: RTCIceServer[], local: MediaStream | null | undefined, my: number) {
    if (local === null) return log('미디어 없이 입장 — 발행 안 함')
    const s =
      local ??
      (await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      }))
    if (seqRef.current !== my) return s.getTracks().forEach((t) => t.stop())
    localRef.current = s
    setLocalStream(s)
    const pc = newPC('pub', iceServers, my)
    pubRef.current = pc
    const trs = s.getTracks().map((t) => ({ t, tr: pc.addTransceiver(t, { direction: 'sendonly' }) }))
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    const ans = await request<{ sdp: string }>('transport.publish', { sdp: offer.sdp })
    await pc.setRemoteDescription({ type: 'answer', sdp: ans.sdp })
    await flushIce('pub')
    for (const { t, tr } of trs) {
      const kind = t.kind as MediaKind
      const r = await request<{ producerId: string }>('produce', {
        mid: tr.mid,
        kind,
        source: kind === 'video' ? 'camera' : 'mic',
      })
      producersRef.current[kind] = r.producerId
      log(`발행 ${kind} producer=${r.producerId}`)
      // 대기실에서 끈 채로 들어오면 서버도 일시정지 — 청중에게 꺼짐 표시·대역폭 절약
      if (!t.enabled) await request('producer.pause', { producerId: r.producerId })
    }
    setLocalOn({
      audio: s.getAudioTracks().some((t) => t.enabled),
      video: s.getVideoTracks().some((t) => t.enabled),
    })
  }

  // 발행 정리 — 발행 PC·producer 표·내 트랙(ROLE_FORBIDDEN 은 연결 유지, 발행만 접는다)
  function closePublish() {
    pubRef.current?.close()
    pubRef.current = null
    iceWait.current.pub = []
    producersRef.current = {}
    setLocalOn({ audio: false, video: false })
    stopLocal()
  }

  // 마이크·카메라 켜기/끄기 — 서버 일시정지(producer.pause/resume). 상태는 서버 응답 뒤에만 확정(낙관적 갱신 안 함, 설계서 14.3)
  // 반환 = 화면 알림이 필요한 실패면 false(요청 중 재호출·나가기 취소는 알림 대상 아님 → true)
  async function setMedia(kind: MediaKind, on: boolean): Promise<boolean> {
    const track = localRef.current?.getTracks().find((t) => t.kind === kind)
    const producerId = producersRef.current[kind]
    if (!track || !producerId) return false
    if (busyRef.current) return true
    busyRef.current = true
    setPending(kind)
    try {
      await request(on ? 'producer.resume' : 'producer.pause', { producerId })
      track.enabled = on
      setLocalOn((p) => ({ ...p, [kind]: on }))
      return true
    } catch (e) {
      log(`${kind} 전환 실패 ${(e as Error).message}`)
      return e instanceof SignalError && e.code === 'LEFT'
    } finally {
      busyRef.current = false
      setPending(null)
    }
  }

  function leave() {
    teardown()
    setState('idle')
  }

  // 세션 전체 정리(leave·fail·끊김 공용) — 화면 상태(state·error)는 호출부가 정한다
  function teardown() {
    seqRef.current++
    const ws = wsRef.current
    if (ws) {
      if (ws.readyState === WebSocket.OPEN) send({ t: 'req', id: nextId.current++, m: 'leave', d: {} })
      ws.onmessage = ws.onclose = ws.onerror = null
      ws.close()
    }
    wsRef.current = null
    pubRef.current?.close()
    subRef.current?.close()
    pubRef.current = subRef.current = null
    stopLocal()
    iceWait.current = { pub: [], sub: [] }
    // 대기 중 요청은 취소(타이머 정리) — 이전 세션의 늦은 TIMEOUT 이 새 세션을 오류로 바꾸지 않게
    for (const cb of pendingRef.current.values()) cb(null)
    pendingRef.current.clear()
    tracksRef.current.clear()
    consumersRef.current.clear()
    pausedRef.current.clear()
    producersRef.current = {}
    subChain.current = Promise.resolve()
    setRemoteVideo(null)
    setRemoteAudio(null)
    setRemotePaused({ audio: false, video: false })
    setLocalOn({ audio: false, video: false })
    busyRef.current = false
    setPending(null)
    setForbidden(false)
  }

  return {
    state,
    error,
    forbidden,
    localStream,
    remoteVideo,
    remoteAudio,
    localOn,
    remotePaused,
    pending,
    join,
    leave,
    setMedia,
  }
}
