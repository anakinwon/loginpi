'use client'
// 화상 방 연결 훅 — 입장권·TURN 발급 → 엔진 /signal(WebSocket) → 발행 PC(클라이언트 offer)·구독 PC(서버 offer, PRD_02 D-2).
// 봉투 {t,id,m,ok,d,e}·메시지 이름은 docs/SIGNAL_API.md v1.1 = media/internal/signal/envelope.go. 룸 화면(/s/[id]/join)과 실험실(/lab/sfu)이 같이 쓴다
// v1.1(3.3) : 참가자(peers)·출처(source)·채팅·손들기·반응·역할 변경(세션 역할이 정본)·세미나 종료
// M4(v1.1.3) : 타일 크기별 consumer.setLayer(100ms 디바운스·바뀔 때만, 청중 수동 상한) · ntf score 등급(가장 나쁜 것)
import { useEffect, useRef, useState } from 'react'
import { piFetch } from '@pi/auth/client'
// v1.2(3.5) : 사회(peer.mute·room.muteAll 잠금·peer.askUnmute)·레이아웃(room.setLayout)·발언자(ntf activeSpeaker)
// v1.3(A-2) : 범용 중계 app.send{topic,d} → ntf app{topic,d,from}(부가 기능 공용, extensions.ts) · 입장 직후 1회 지원 확인 · 카메라 송신기(영상 효과 replaceTrack)
import type { AppMsg } from './extensions'
import {
  APP_MAX,
  APP_PROBE,
  appSupportedBy,
  batchReaction,
  capLayer,
  layerSender,
  NO_LOCKS,
  ownerKey,
  REACT,
  worstGrade,
  type Grade,
  type Layer,
  type Locks,
  type PeerLike,
  type PeerRole,
  type QualityCap,
  type RoomLayout,
} from './room-rules'

export type Role = 'presenter' | 'audience' // 입장권으로 요청하는 역할(panel 은 승격으로만, SIGNAL_API 6절)
export type SessionRole = PeerRole
export type MediaKind = 'audio' | 'video'
export type Source = 'camera' | 'screen' | 'mic'
export type Peer = PeerLike
// 받은 producer 하나 — peerId = 주인 키(ownerKey : consumerCreated.peer, 비면 producer 별 대체 키), stream 은 그 트랙 하나만 담은 화면용 스트림(트랙이 같으면 같은 객체)
export type RemoteTrack = {
  producerId: string
  consumerId: string // setLayer 대상
  peerId: string
  kind: MediaKind
  source: Source
  paused: boolean
  stream: MediaStream
}
// n = 받은 순번(안 읽은 수 계산용). mine 은 즉시 표시(sending) → chat.send 응답 ts 로 확정(sent)
export type ChatMsg = {
  n: number
  peerId: string
  name: string
  text: string
  ts: number
  mine: boolean
  status: 'sending' | 'sent' | 'failed'
}
// reconnecting = 입장 뒤 발행·구독 PC 중 하나가 disconnected(ICE 가 스스로 복구 중). failed 가 되면 error(ICE_FAILED)
export type RoomState = 'idle' | 'ticket' | 'connecting' | 'joined' | 'reconnecting' | 'closed' | 'error'
type Env = {
  t: 'req' | 'res' | 'ntf'
  id?: number
  m?: string
  ok?: boolean
  d?: unknown
  e?: { code: string; msg: string }
}
type Trickle = { pc: 'pub' | 'sub'; candidate: RTCIceCandidateInit }
// peer = 발행자 peerId(SIGNAL_API v1.1.2 — envelope.go ConsumerCreated.Peer). 구 엔진이면 비어 올 수 있어 선택 필드
type Consumer = {
  consumerId: string
  producerId: string
  kind: MediaKind
  mid: string
  source?: Source
  paused?: boolean
  peer?: string
}
type JoinRes = {
  peerId: string
  role?: SessionRole
  iceServers: RTCIceServer[]
  producers: { id: string; kind: MediaKind; peer: string; source?: Source }[]
  peers?: Peer[]
  policy?: { locked: Locks } // v1.2 — 있으면 엔진이 사회·발언자를 지원
  layout?: RoomLayout
}
// 사회 알림(화면이 문구·고정 알림으로 보인다) — seq 로 같은 내용이 연달아 와도 새 알림
export type ModEvent =
  | { type: 'mutedBy'; kind: MediaKind; seq: number }
  | { type: 'askUnmute'; kind: MediaKind; seq: number }
  | { type: 'policy'; locks: Locks; seq: number }

const REQ_TIMEOUT_MS = 10000
const CHAT_MAX = 500 // SIGNAL_API 3.3 C — 유니코드 문자 수
const CHAT_KEEP = 200 // ponytail: 화면에 남기는 채팅 수 상한(저장 안 함 — 오래된 것부터 버림), 긴 세미나에서 더 필요하면 가상 스크롤과 함께 늘린다
const VIDEO = { width: { ideal: 1280 }, height: { ideal: 720 } }

// 엔진 응답 실패 — code 는 SIGNAL_API 5절 오류 코드(화면 문구 키로 쓴다). LEFT = 나가기로 취소된 요청
class SignalError extends Error {
  constructor(
    public code: string,
    msg: string,
  ) {
    super(`${code} ${msg}`)
  }
}
const codeOf = (e: unknown) => (e instanceof SignalError ? e.code : 'MEDIA_FAILED')

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

// appProbe = 등록 기능 중 엔진 app 중계가 있어야 보이는 항목이 있을 때만 입장 직후 지원 확인(없으면 요청 0 — 회귀 0)
export function useRoom({ wsUrl, onLog, appProbe = false }: { wsUrl?: string; onLog?: (m: string) => void; appProbe?: boolean }) {
  const wsRef = useRef<WebSocket | null>(null)
  const pubRef = useRef<RTCPeerConnection | null>(null)
  const subRef = useRef<RTCPeerConnection | null>(null)
  const localRef = useRef<MediaStream | null>(null) // 카메라·마이크
  const screenRef = useRef<MediaStream | null>(null) // 화면공유(따로 — 끌 때 카메라를 건드리지 않게)
  const iceRef = useRef<RTCIceServer[]>([]) // 입장 때 받은 ICE — 승격·화면공유로 발행 PC 를 나중에 만들 때 쓴다
  // 응답 대기표 — 값은 응답(Env) 또는 null(나가기로 취소)을 받는 콜백. 콜백이 자기 타이머를 정리한다
  const pendingRef = useRef(new Map<number, (e: Env | null) => void>())
  const iceWait = useRef<{ pub: RTCIceCandidateInit[]; sub: RTCIceCandidateInit[] }>({ pub: [], sub: [] })
  const nextId = useRef(1)
  // 구독 PC 재협상 직렬 큐 — 서버 offer 가 연달아 와도 setRemoteDescription·answer 가 겹치지 않게 차례로 처리
  const subChain = useRef<Promise<void>>(Promise.resolve())
  // 발행 재협상 직렬 큐 — 승격 뒤 마이크·카메라·화면공유를 연달아 켜도 offer/answer 가 겹치지 않게
  const pubChain = useRef<Promise<void>>(Promise.resolve())
  const pubCount = useRef(0)
  // 지금 disconnected 인 PC 종류 — 둘 다 회복돼야 joined 로 돌아간다
  const downRef = useRef(new Set<'pub' | 'sub'>())
  // 세션 순번 — leave 때마다 증가. 늦게 끝난 이전 세션의 await·이벤트가 새 세션 상태를 덮지 않게 비교한다
  const seqRef = useRef(0)
  // 구독 대응표 — mid→트랙(ontrack), producerId→consumer(consumerCreated), 일시정지 producerId 집합(알림 도착 순서 무관)
  const tracksRef = useRef(new Map<string, MediaStreamTrack>())
  const consumersRef = useRef(new Map<string, Consumer>())
  const pausedRef = useRef(new Set<string>())
  const streamCache = useRef(new Map<string, { track: MediaStreamTrack; stream: MediaStream }>())
  // 내 producer·송신기 — 출처별(mic·camera·screen)
  const producersRef = useRef<Partial<Record<Source, string>>>({})
  const sendersRef = useRef<Partial<Record<Source, RTCRtpTransceiver>>>({})
  // 참가자 — 정본은 ref(알림 처리 중 최신값), 화면은 배열 state
  const peersRef = useRef(new Map<string, Peer>())
  const selfRef = useRef('')
  const chatN = useRef(0)
  const reactRef = useRef<{ list: string[]; timer?: ReturnType<typeof setTimeout> }>({ list: [] })
  const reactSeq = useRef(0)
  // 수신 화질 — consumerId → 타일이 계산한 레이어(상한 적용 전), 송신기(디바운스·중복 제거), 수동 상한, 등급
  const wantRef = useRef(new Map<string, Layer>())
  const capRef = useRef<QualityCap>('auto')
  const gradesRef = useRef(new Map<string, Grade>())
  const layerRef = useRef<ReturnType<typeof layerSender> | null>(null)
  const [qualityCap, setCap] = useState<QualityCap>('auto')
  const [quality, setQuality] = useState<Grade>('excellent')
  const [state, setState] = useState<RoomState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [localScreen, setLocalScreen] = useState<MediaStream | null>(null)
  // 원격 영상·소리는 종류별 스트림 — 소리 트랙이 붙어도 영상 요소 srcObject 가 바뀌지 않게(깜박임 방지). 소리는 이 하나로만 낸다
  const [remoteVideo, setRemoteVideo] = useState<MediaStream | null>(null)
  const [remoteAudio, setRemoteAudio] = useState<MediaStream | null>(null)
  const [tracks, setTracks] = useState<RemoteTrack[]>([])
  const [localOn, setLocalOn] = useState({ audio: false, video: false })
  const [remotePaused, setRemotePaused] = useState({ audio: false, video: false })
  const [pending, setPending] = useState<MediaKind | null>(null)
  // 발행 완료(produce 응답까지) — 그 전엔 producerId 가 없어 토글이 실패하므로 하단 바 버튼을 막는다
  const [published, setPublished] = useState(false)
  const [pubBusy, setPubBusy] = useState(false) // 발행 협상 중(승격 뒤 켜기·화면공유)
  // 토글 요청 중 여부 — 단축키 연타처럼 렌더 전에 다시 불릴 때 state 클로저 값은 믿을 수 없어 ref 로 막는다
  const busyRef = useRef(false)
  // 발행 거부(ROLE_FORBIDDEN) — 연결은 유지하고 화면은 청중으로 전환(설계서 7.3)
  const [forbidden, setForbidden] = useState(false)
  const [role, setRole] = useState<SessionRole | null>(null) // 세션 역할(입장 응답 → roleChanged)
  const [selfId, setSelfId] = useState('')
  const [peers, setPeers] = useState<Peer[]>([])
  const [chat, setChat] = useState<ChatMsg[]>([])
  const [reaction, setReaction] = useState<{ counts: Record<string, number>; seq: number } | null>(null)
  // v1.2 — 잠금(join policy·ntf roomPolicy), 레이아웃(join layout·ntf layout), 발언자(ntf activeSpeaker), 엔진 발언자 판정 지원 여부
  const [locks, setLocks] = useState<Locks>(NO_LOCKS)
  const [layout, setLayoutState] = useState<RoomLayout | null>(null)
  const [speaker, setSpeaker] = useState<string | null>(null)
  const [engineSpeaker, setEngineSpeaker] = useState(false)
  const [modEvent, setModEvent] = useState<ModEvent | null>(null)
  const modSeq = useRef(0)
  // v1.3 app 중계 — 구독자(부가 기능), 지원 여부(null = 확인 중·입장 전, false = 구 엔진 : 의존 기능 숨김). ref = 요청 경로용 최신값
  const appSubs = useRef(new Set<(m: AppMsg) => void>())
  const appRef = useRef<boolean | null>(null)
  const [appSupported, setAppState] = useState<boolean | null>(null)
  // 카메라 송신기 — 영상 효과가 처리 트랙으로 replaceTrack 할 대상(카메라 발행 전·강등 뒤 null)
  const [videoSender, setVideoSender] = useState<RTCRtpSender | null>(null)

  const log = (m: string) => onLog?.(m)

  useEffect(() => () => leave(), []) // eslint-disable-line react-hooks/exhaustive-deps

  function stopLocal() {
    localRef.current?.getTracks().forEach((t) => t.stop())
    localRef.current = null
    setLocalStream(null)
  }

  function stopScreen() {
    screenRef.current?.getTracks().forEach((t) => t.stop())
    screenRef.current = null
    setLocalScreen(null)
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

  function commitPeers() {
    setPeers([...peersRef.current.values()])
  }
  function patchPeer(id: string, p: Partial<Peer>) {
    const cur = peersRef.current.get(id)
    if (cur) peersRef.current.set(id, { ...cur, ...p })
  }

  // 받은 트랙·consumer·일시정지 표 → 화면 상태. 종류별 스트림은 트랙 구성이 실제로 바뀔 때만 새로 만든다
  // (같은 객체를 고치면 React 가 모름, 매번 만들면 영상이 깜박임). producer 별 스트림도 트랙이 같으면 재사용
  function sync() {
    const live = [...tracksRef.current.values()].filter((t) => t.readyState === 'live')
    const pick = (k: MediaKind) => (prev: MediaStream | null) => {
      const ts = live.filter((t) => t.kind === k)
      const cur = prev?.getTracks() ?? []
      if (cur.length === ts.length && ts.every((t) => cur.includes(t))) return prev
      return ts.length ? new MediaStream(ts) : null
    }
    setRemoteVideo(pick('video'))
    setRemoteAudio(pick('audio'))
    const cs = [...consumersRef.current.values()]
    const p = (k: MediaKind) => cs.some((c) => c.kind === k && pausedRef.current.has(c.producerId))
    setRemotePaused({ audio: p('audio'), video: p('video') })
    const list: RemoteTrack[] = []
    for (const c of cs) {
      const tr = tracksRef.current.get(c.mid)
      if (!tr || tr.readyState !== 'live') continue
      let cached = streamCache.current.get(c.producerId)
      if (cached?.track !== tr) {
        cached = { track: tr, stream: new MediaStream([tr]) }
        streamCache.current.set(c.producerId, cached)
      }
      list.push({
        producerId: c.producerId,
        consumerId: c.consumerId,
        peerId: ownerKey(c.peer, c.producerId),
        kind: c.kind,
        source: c.source ?? (c.kind === 'audio' ? 'mic' : 'camera'),
        paused: pausedRef.current.has(c.producerId),
        stream: cached.stream,
      })
    }
    for (const id of streamCache.current.keys()) if (!consumersRef.current.has(id)) streamCache.current.delete(id)
    setTracks(list)
  }

  function newPC(kind: 'pub' | 'sub', iceServers: RTCIceServer[], my: number) {
    const pc = new RTCPeerConnection({ iceServers })
    pc.onicecandidate = (ev) => {
      // trickle 은 응답이 필요 없어 ntf 로 보낸다(SIGNAL_API 3.1 — 엔진이 ntf 도 받음)
      if (ev.candidate) send({ t: 'ntf', m: 'trickle', d: { pc: kind, candidate: ev.candidate.toJSON() } })
    }
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState
      log(`${kind === 'pub' ? '발행' : '구독'} PC ${st}`)
      // 이전 세션·이미 바꾼 발행 PC(강등 뒤 닫힌 것)의 이벤트는 무시
      if (seqRef.current !== my || (kind === 'pub' ? pubRef.current : subRef.current) !== pc) return
      if (st === 'failed') return fail('ICE_FAILED')
      if (st === 'disconnected') downRef.current.add(kind)
      else if (st === 'connected') downRef.current.delete(kind)
      // 입장 뒤에만 joined ↔ reconnecting 을 오간다(입장 중·오류·끊김 상태는 건드리지 않음)
      const next = downRef.current.size ? 'reconnecting' : 'joined'
      setState((s) => (s === 'joined' || s === 'reconnecting' ? next : s))
    }
    return pc
  }

  // remote SDP 전에 온 후보는 모아 두었다가 적용
  async function flushIce(kind: 'pub' | 'sub') {
    const pc = kind === 'pub' ? pubRef.current : subRef.current
    if (!pc?.remoteDescription) return
    for (const c of iceWait.current[kind].splice(0)) await pc.addIceCandidate(c).catch(() => {})
  }

  // roleChanged — 세션 역할이 정본(SIGNAL_API 3.3 D). 모르는 peerId 는 무시
  function onRoleChanged(d: { peerId: string; role: SessionRole }) {
    if (!peersRef.current.has(d.peerId)) return
    patchPeer(d.peerId, { role: d.role, ...(d.role === 'panel' ? { raisedTs: 0 } : {}) })
    if (d.peerId === selfRef.current) {
      setRole(d.role)
      // 발행 권한이 다시 생겼다 — 이전 ROLE_FORBIDDEN 표시를 풀어야 화면이 새 역할(panel·presenter)로 돌아온다
      if (d.role !== 'audience') setForbidden(false)
      // 화질 상한 버튼은 청중 바에만 있다 — 무대에 오르면 상한을 풀어(자동) 고를 수 없는 상한에 갇히지 않게
      if (d.role !== 'audience' && capRef.current !== 'auto') setQualityCap('auto')
      log(`내 역할 → ${d.role}`)
      if (d.role === 'audience') {
        // 강등 — 서버가 내 producer 를 닫았다. 내 트랙·발행 PC 정리, 손 목록은 청중 범위 밖이라 비운다
        closePublish()
        for (const p of peersRef.current.values())
          if (p.peerId !== selfRef.current) patchPeer(p.peerId, { raisedTs: 0 })
      }
      // 승격 — 마이크는 자동으로 켜지 않는다(화면이 [마이크 켜기] 알림을 띄움, 설계서 14.4)
    }
    commitPeers()
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
      log(`구독 생성 ${c.kind}(${c.source ?? '?'}) mid=${c.mid}`)
      sync()
    } else if (e.m === 'producerPaused' || e.m === 'producerResumed') {
      const id = (e.d as { producerId: string }).producerId
      if (e.m === 'producerPaused') pausedRef.current.add(id)
      else pausedRef.current.delete(id)
      sync()
    } else if (e.m === 'producerClosed') {
      const id = (e.d as { producerId: string }).producerId
      const c = consumersRef.current.get(id)
      if (c) {
        tracksRef.current.delete(c.mid)
        forgetConsumer(c.consumerId)
      }
      consumersRef.current.delete(id)
      pausedRef.current.delete(id)
      sync()
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
    } else if (e.m === 'peerJoined') {
      for (const p of (e.d as { peers: Peer[] }).peers ?? []) peersRef.current.set(p.peerId, p)
      commitPeers()
    } else if (e.m === 'peerLeft') {
      for (const id of (e.d as { peerIds: string[] }).peerIds ?? []) peersRef.current.delete(id)
      commitPeers()
    } else if (e.m === 'hand') {
      const h = e.d as { peerId: string; raisedTs: number }
      if (!peersRef.current.has(h.peerId)) return
      patchPeer(h.peerId, { raisedTs: h.raisedTs })
      commitPeers()
    } else if (e.m === 'roleChanged') {
      onRoleChanged(e.d as { peerId: string; role: SessionRole })
    } else if (e.m === 'chat') {
      const c = e.d as { peerId: string; name: string; text: string; ts: number }
      addChat({ ...c, n: ++chatN.current, mine: false, status: 'sent' })
    } else if (e.m === 'reaction') {
      const r = e.d as { counts: Record<string, number> }
      setReaction({ counts: r.counts ?? {}, seq: ++reactSeq.current })
    } else if (e.m === 'score') {
      // 내 수신(consumerId)만 — producerId 형은 엔진이 아직 보내지 않는다(SIGNAL_API 3.4). 모르는 consumer 는 무시
      const sc = e.d as { consumerId?: string; grade: Grade }
      if (!sc.consumerId || ![...consumersRef.current.values()].some((c) => c.consumerId === sc.consumerId)) return
      gradesRef.current.set(sc.consumerId, sc.grade)
      setQuality(worstGrade(gradesRef.current.values()))
    } else if (e.m === 'mutedBy') {
      // 발표자가 내 producer 를 껐다(본인에겐 producerPaused 가 오지 않음) — 내 트랙도 꺼서 미리보기·버튼을 맞춘다
      const m = e.d as { kind: MediaKind; producerIds: string[] }
      const mine = producersRef.current[m.kind === 'audio' ? 'mic' : 'camera']
      if (!mine || !m.producerIds?.includes(mine)) return
      localRef.current?.getTracks().forEach((t) => {
        if (t.kind === m.kind) t.enabled = false
      })
      setLocalOn((p) => ({ ...p, [m.kind]: false }))
      setModEvent({ type: 'mutedBy', kind: m.kind, seq: ++modSeq.current })
    } else if (e.m === 'askUnmute') {
      // 켜 달라는 요청 — 자동으로 켜지 않는다(화면이 [켜기]/[무시] 고정 알림, 사용자 탭으로만)
      const a = e.d as { kind: MediaKind }
      setModEvent({ type: 'askUnmute', kind: a.kind, seq: ++modSeq.current })
    } else if (e.m === 'roomPolicy') {
      const l = (e.d as { locked: Locks }).locked ?? NO_LOCKS
      setLocks(l)
      setModEvent({ type: 'policy', locks: l, seq: ++modSeq.current })
    } else if (e.m === 'layout') {
      setLayoutState(e.d as RoomLayout)
    } else if (e.m === 'activeSpeaker') {
      setSpeaker((e.d as { peerId: string | null }).peerId ?? null)
    } else if (e.m === 'app') {
      // 부가 기능 중계(v1.3) — 형식이 맞는 것만 구독자에게. 구독자 오류가 시그널링 처리를 멈추지 않게 각자 감싼다
      const a = e.d as AppMsg
      if (typeof a?.topic !== 'string') return
      for (const fn of appSubs.current) {
        try {
          fn(a)
        } catch (err) {
          log(`app 처리 실패 ${a.topic} ${(err as Error).message}`)
        }
      }
    } else if (e.m === 'error') {
      const er = e.d as { code: string; msg: string }
      log(`서버 오류 ${er.code} ${er.msg}`)
      fail(er.code)
    } else {
      log(`알림 ${e.m}`)
    }
  }

  function addChat(m: ChatMsg) {
    setChat((l) => [...l, m].slice(-CHAT_KEEP))
  }

  // local : 스트림 = 그대로 발행 / null = 미디어 없이 입장(권한 거부 — 발행 안 함) / undefined = 여기서 카메라 요청(실험실)
  // devName = 실험실 개발용 입장(엔진 MEDIA_DEV_TICKET=1 만 통과)
  async function join(room: string, ticketRole: Role, local?: MediaStream | null, devName?: string) {
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
    const [tk, turn] = await Promise.all([fetchTicket(room, ticketRole), fetchTurn()])
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
      const res = await request<JoinRes>(
        'join',
        tk.ticket ? { ticket: tk.ticket } : { room, role: ticketRole, name: devName },
      )
      if (stale()) return
      const ice = [...res.iceServers, ...turn]
      iceRef.current = ice
      selfRef.current = res.peerId
      setSelfId(res.peerId)
      setRole(res.role ?? ticketRole)
      for (const p of res.peers ?? []) peersRef.current.set(p.peerId, p)
      commitPeers()
      setEngineSpeaker(!!res.policy) // v1.2 엔진만 policy 를 준다 — 구 엔진이면 타일이 AudioContext 로 말하기 판정
      setLocks(res.policy?.locked ?? NO_LOCKS)
      setLayoutState(res.layout ?? null)
      log(`입장 peer=${res.peerId} 참가자 ${res.peers?.length ?? '?'}명 기존 발행 ${res.producers.length}개`)
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
          sync()
        })
        sync()
      }
      setState('joined')
      if (appProbe) probeApp(my)
      if (ticketRole === 'presenter') await publish(local, my)
    } catch (e) {
      log(`입장 실패 ${(e as Error).message}`)
      if (stale()) return
      // ROLE_FORBIDDEN 은 연결 유지(SIGNAL_API 5절) — 발행만 접고 청중처럼 계속 본다(설계서 7.3)
      if (e instanceof SignalError && e.code === 'ROLE_FORBIDDEN') {
        setForbidden(true)
        return closePublish()
      }
      fail(codeOf(e))
    }
  }

  // 입장 직후 발표자 발행 — 대기실 스트림(없으면 여기서 카메라 요청 — 실험실)
  async function publish(local: MediaStream | null | undefined, my: number) {
    if (local === null) return log('미디어 없이 입장 — 발행 안 함')
    const s = local ?? (await navigator.mediaDevices.getUserMedia({ video: VIDEO, audio: true }))
    if (seqRef.current !== my) return s.getTracks().forEach((t) => t.stop())
    localRef.current = s
    setLocalStream(s)
    await publishTracks(
      s.getTracks().map((t) => ({ t, source: t.kind === 'video' ? 'camera' : 'mic' })),
      my,
    )
  }

  // 트랙 발행(첫 발행·승격 뒤 켜기·화면공유 공용) — 발행 PC 가 없으면 만들고, 있으면 같은 PC 에 트랜시버를 더해 재협상(새 mid).
  // 직렬 큐로 하나씩. produce 끼리는 서로 독립이라 병렬(R-P1). 대기실에서 끈 트랙은 서버도 일시정지(청중 꺼짐 표시·대역폭 절약)
  function publishTracks(list: { t: MediaStreamTrack; source: Source }[], my: number): Promise<void> {
    pubCount.current++
    setPubBusy(true)
    const run = pubChain.current.then(async () => {
      if (seqRef.current !== my) return
      let pc = pubRef.current
      if (!pc) {
        pc = newPC('pub', iceRef.current, my)
        pubRef.current = pc
      }
      const trs = list.map((x) => ({ ...x, tr: pc.addTransceiver(x.t, { direction: 'sendonly' }) }))
      // 카메라 송신기는 offer 전에 알린다 — 영상 효과가 연결(ICE·DTLS) 전에 처리 트랙으로 바꿔 원본 프레임이 나가지 않게 [확인중 : 실기기 첫 프레임]
      const cam = trs.find((x) => x.source === 'camera')
      if (cam) setVideoSender(cam.tr.sender)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const ans = await request<{ sdp: string }>('transport.publish', { sdp: offer.sdp })
      if (seqRef.current !== my || pubRef.current !== pc) return // 그사이 강등·나가기
      await pc.setRemoteDescription({ type: 'answer', sdp: ans.sdp })
      await flushIce('pub')
      await Promise.all(
        trs.map(async ({ t, tr, source }) => {
          const r = await request<{ producerId: string }>('produce', { mid: tr.mid, kind: t.kind, source })
          if (seqRef.current !== my) return
          producersRef.current[source] = r.producerId
          sendersRef.current[source] = tr
          log(`발행 ${source} producer=${r.producerId}`)
          if (!t.enabled) await request('producer.pause', { producerId: r.producerId })
        }),
      )
      if (seqRef.current !== my) return
      const s = localRef.current
      setLocalOn({
        audio: !!s?.getAudioTracks().some((t) => t.enabled),
        video: !!s?.getVideoTracks().some((t) => t.enabled),
      })
      setPublished(true)
    })
    pubChain.current = run.catch(() => {})
    return run.finally(() => {
      if (--pubCount.current <= 0) {
        pubCount.current = 0
        setPubBusy(false)
      }
    })
  }

  // 승격된 panel·카메라 없이 들어온 발표자가 마이크·카메라를 켠다 — 반드시 사용자 탭 안에서 부른다(자동 켜기 금지, 설계서 14.4).
  // 반환 = 화면 알림용 오류 코드(성공 null)
  async function addMedia(kind: MediaKind): Promise<string | null> {
    const my = seqRef.current
    const s = await navigator.mediaDevices
      ?.getUserMedia(kind === 'audio' ? { audio: true } : { video: VIDEO })
      .catch(() => null)
    if (!s) return 'MEDIA_FAILED'
    if (seqRef.current !== my) {
      s.getTracks().forEach((t) => t.stop())
      return null
    }
    const t = s.getTracks()[0]
    // 내 스트림에 합친다(타일·말하기 링이 한 스트림을 본다). 새 객체로 바꿔야 화면이 안다
    const merged = new MediaStream([...(localRef.current?.getTracks() ?? []).filter((x) => x.kind !== kind), t])
    localRef.current = merged
    setLocalStream(merged)
    try {
      await publishTracks([{ t, source: kind === 'audio' ? 'mic' : 'camera' }], my)
      return null
    } catch (e) {
      log(`${kind} 발행 실패 ${(e as Error).message}`)
      t.stop()
      if (localRef.current === merged) {
        const rest = new MediaStream(merged.getTracks().filter((x) => x !== t))
        localRef.current = rest
        setLocalStream(rest)
      }
      if (e instanceof SignalError && e.code === 'ROLE_FORBIDDEN') closePublish()
      return e instanceof SignalError && e.code === 'LEFT' ? null : codeOf(e)
    }
  }

  // 화면공유 — getDisplayMedia 는 호출부가 기능 탐지로만 노출(UA 판정 금지). 사용자가 브라우저의 "공유 중지"를 눌러도 끈다
  async function shareScreen(on: boolean): Promise<string | null> {
    const my = seqRef.current
    if (!on) {
      const id = producersRef.current.screen
      const tr = sendersRef.current.screen
      delete producersRef.current.screen
      delete sendersRef.current.screen
      stopScreen()
      if (tr) {
        tr.sender.replaceTrack(null).catch(() => {})
        // 죽은 sendonly 를 남기지 않는다 — 다음 offer(다음 발행·공유)부터 inactive 로 협상돼 서버도 그 m-line 을 받기만 끝낸다.
        // ponytail: 공유 1회당 inactive m-line 1개씩 늘어난다(수 회면 무해). mid 재사용(replaceTrack)은 엔진 closeProducer 가
        // pubMids[mid] 를 지우지 않아 같은 mid produce 가 닫힌 producer 를 돌려주므로 엔진 수정 뒤 전환
        try {
          tr.direction = 'inactive'
        } catch {
          // 발행 PC 가 이미 닫힘(강등·나가기) — 할 일 없음
        }
      }
      if (id)
        await request('producer.close', { producerId: id }).catch((e: Error) => log(`화면공유 닫기 실패 ${e.message}`))
      return null
    }
    const s = await navigator.mediaDevices?.getDisplayMedia({ video: true, audio: false }).catch(() => null)
    if (!s) return null // 사용자가 고르기 창에서 취소 — 알림 대상 아님
    if (seqRef.current !== my) {
      s.getTracks().forEach((t) => t.stop())
      return null
    }
    const t = s.getVideoTracks()[0]
    t.contentHint = 'detail' // 글자 선명도 우선
    t.addEventListener('ended', () => {
      if (screenRef.current === s) void shareScreen(false)
    })
    screenRef.current = s
    setLocalScreen(s)
    try {
      await publishTracks([{ t, source: 'screen' }], my)
      return null
    } catch (e) {
      log(`화면공유 발행 실패 ${(e as Error).message}`)
      if (screenRef.current === s) stopScreen()
      if (e instanceof SignalError && e.code === 'ROLE_FORBIDDEN') closePublish()
      return e instanceof SignalError && e.code === 'LEFT' ? null : codeOf(e)
    }
  }

  // 발행 정리 — 발행 PC·producer 표·내 트랙(ROLE_FORBIDDEN·강등은 연결 유지, 발행만 접는다)
  function closePublish() {
    pubRef.current?.close()
    pubRef.current = null
    downRef.current.delete('pub')
    if (!downRef.current.size) setState((s) => (s === 'reconnecting' ? 'joined' : s))
    iceWait.current.pub = []
    producersRef.current = {}
    sendersRef.current = {}
    setVideoSender(null)
    setPublished(false)
    setLocalOn({ audio: false, video: false })
    stopLocal()
    stopScreen()
  }

  // 마이크·카메라 켜기/끄기 — 서버 일시정지(producer.pause/resume). 상태는 서버 응답 뒤에만 확정(낙관적 갱신 안 함, 설계서 14.3)
  // 반환 = 화면 알림이 필요한 실패면 false(요청 중 재호출·나가기 취소는 알림 대상 아님 → true)
  async function setMedia(kind: MediaKind, on: boolean): Promise<boolean> {
    const track = localRef.current?.getTracks().find((t) => t.kind === kind)
    const producerId = producersRef.current[kind === 'audio' ? 'mic' : 'camera']
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

  // 채팅 — 내 메시지는 바로 보이고(sending) chat.send 응답 ts 로 확정. 반환 = 오류 코드(성공·빈 값 null)
  async function sendChat(text: string): Promise<string | null> {
    const body = text.trim()
    if (!body) return null
    if ([...body].length > CHAT_MAX) return 'SDP_INVALID'
    const n = ++chatN.current
    const me = peersRef.current.get(selfRef.current)
    addChat({
      n,
      peerId: selfRef.current,
      name: me?.name ?? '',
      text: body,
      ts: Date.now(),
      mine: true,
      status: 'sending',
    })
    return deliverChat(n, body)
  }

  // 실패한 내 메시지 다시 보내기 — 같은 글을 같은 자리(n)에서 다시 보낸다(새 줄을 만들지 않아 중복 없음)
  function retryChat(n: number, text: string): Promise<string | null> {
    return deliverChat(n, text, Date.now())
  }

  function deliverChat(n: number, text: string, ts?: number): Promise<string | null> {
    const mark = (p: Partial<ChatMsg>) => setChat((l) => l.map((m) => (m.n === n ? { ...m, ...p } : m)))
    if (ts) mark({ ts, status: 'sending' })
    return request<{ ts: number }>('chat.send', { text }).then(
      (r) => {
        mark({ ts: r.ts, status: 'sent' })
        return null
      },
      (e: unknown) => {
        mark({ status: 'failed' })
        return codeOf(e)
      },
    )
  }

  // 손들기(audience) — 응답 raisedTs(서버 시각)로 내 상태 확정
  async function setHand(raised: boolean): Promise<string | null> {
    try {
      const r = await request<{ raisedTs: number }>('hand.set', { raised })
      patchPeer(selfRef.current, { raisedTs: r.raisedTs })
      commitPeers()
      return null
    } catch (e) {
      return codeOf(e)
    }
  }

  // 관리 요청(presenter) — 결과는 알림(hand·roleChanged·error ROOM_CLOSED)으로 온다. 반환 = 오류 코드
  const admin = (m: string, d: unknown) =>
    request(m, d).then(
      () => null,
      (e: unknown) => codeOf(e),
    )
  const lowerAll = () => admin('hand.lowerAll', {})
  const setPeerRole = (peerId: string, r: 'panel' | 'audience') => admin('peer.setRole', { peerId, role: r })
  const end = () => admin('room.end', {})
  // 사회(v1.2) — 순서·잠금 검사는 서버가 한 처리 안에서 한다. 결과는 producerPaused·roomPolicy 알림으로 온다
  const mutePeer = (peerId: string, kind: MediaKind) => admin('peer.mute', { peerId, kind })
  const askUnmute = (peerId: string, kind: MediaKind) => admin('peer.askUnmute', { peerId, kind })
  const muteAll = (kind: MediaKind, lock: boolean) => admin('room.muteAll', { kind, lock })
  // 레이아웃 — 무대 고정의 내 화면공유 키는 room-rules layoutFor 가 바꾼다(그래서 내 화면공유 producerId 를 넘긴다)
  const setLayout = (l: RoomLayout) => admin('room.setLayout', l)
  const screenProducerId = () => producersRef.current.screen

  // ── v1.3 app 중계(A-2) ──
  function setApp(v: boolean | null) {
    appRef.current = v
    setAppState(v)
  }

  // 지원 확인(입장 직후 1회, 부작용 없음) — 요청·판정 규칙은 room-rules APP_PROBE·appSupportedBy(시험 있음)
  function probeApp(my: number) {
    request('app.send', APP_PROBE).then(
      () => seqRef.current === my && setApp(true),
      (e: unknown) => {
        const c = codeOf(e)
        if (seqRef.current !== my || c === 'LEFT') return
        setApp(appSupportedBy(c))
      },
    )
  }

  // 보내기 — 반환 = 오류 코드(성공 null). 구 엔진(확인 결과 false)·큰 d 는 보내지 않는다.
  // 지원 여부는 probeApp 만 정한다 — v1.3 의 NOT_FOUND 는 주제 오타·'참가자 없음' 경합도 내므로 한 번의 실패로 세션 전체 기능을 끄지 않는다
  async function sendApp(topic: string, d: unknown): Promise<string | null> {
    if (appRef.current === false) return 'NOT_FOUND'
    if (new TextEncoder().encode(JSON.stringify(d ?? null)).length > APP_MAX) return 'TOO_LARGE'
    try {
      await request('app.send', { topic, d })
      return null
    } catch (e) {
      return codeOf(e)
    }
  }

  // 받기 구독 — 반환 = 해지 함수. 세션이 바뀌어도 구독은 유지(룸 화면이 한 번 건다)
  function subscribeApp(fn: (m: AppMsg) => void) {
    appSubs.current.add(fn)
    return () => {
      appSubs.current.delete(fn)
    }
  }

  // 반응 — 500ms 묶음(최대 3개)으로 보낸다. 서버가 300ms 합산해 전원(나 포함)에게 ntf reaction 으로 돌려준다
  function react(emoji: string) {
    const b = reactRef.current
    const next = batchReaction(b.list, emoji)
    if (next === b.list) return
    b.list = next
    if (b.timer) return
    b.timer = setTimeout(() => {
      const emojis = b.list
      b.list = []
      b.timer = undefined
      request('reaction.send', { emojis }).catch((e: Error) => log(`반응 실패 ${e.message}`))
    }, REACT.batchMs)
  }

  // 수신 화질 상한(설계서 14.2) — 타일이 렌더 높이·가시성으로 계산한 값. 청중 수동 상한으로 자른 뒤 바뀔 때만 보낸다
  function sender() {
    layerRef.current ??= layerSender((consumerId, maxSpatial) =>
      request('consumer.setLayer', { consumerId, maxSpatial }).catch((e: Error) => log(`화질 요청 실패 ${e.message}`)),
    )
    return layerRef.current
  }
  function setLayer(consumerId: string, maxSpatial: Layer) {
    wantRef.current.set(consumerId, maxSpatial)
    sender().update(consumerId, capLayer(maxSpatial, capRef.current))
  }
  function setQualityCap(cap: QualityCap) {
    capRef.current = cap
    setCap(cap)
    for (const [id, v] of wantRef.current) sender().update(id, capLayer(v, cap))
  }
  function forgetConsumer(consumerId: string) {
    wantRef.current.delete(consumerId)
    layerRef.current?.forget(consumerId)
    if (gradesRef.current.delete(consumerId)) setQuality(worstGrade(gradesRef.current.values()))
  }

  // 발행 PC 통계(발표자 연결 점검용) — 발행 전·청중이면 null
  function pubStats(): Promise<RTCStatsReport | null> {
    return pubRef.current?.getStats().catch(() => null) ?? Promise.resolve(null)
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
    stopScreen()
    iceWait.current = { pub: [], sub: [] }
    // 대기 중 요청은 취소(타이머 정리) — 이전 세션의 늦은 TIMEOUT 이 새 세션을 오류로 바꾸지 않게
    for (const cb of pendingRef.current.values()) cb(null)
    pendingRef.current.clear()
    tracksRef.current.clear()
    consumersRef.current.clear()
    pausedRef.current.clear()
    wantRef.current.clear()
    layerRef.current?.reset()
    gradesRef.current.clear()
    setQuality('excellent')
    streamCache.current.clear()
    producersRef.current = {}
    sendersRef.current = {}
    peersRef.current.clear()
    selfRef.current = ''
    clearTimeout(reactRef.current.timer)
    reactRef.current = { list: [] }
    subChain.current = Promise.resolve()
    pubChain.current = Promise.resolve()
    pubCount.current = 0
    setPubBusy(false)
    downRef.current.clear()
    setRemoteVideo(null)
    setRemoteAudio(null)
    setTracks([])
    setRemotePaused({ audio: false, video: false })
    setLocalOn({ audio: false, video: false })
    busyRef.current = false
    setPending(null)
    setPublished(false)
    setForbidden(false)
    setRole(null)
    setSelfId('')
    setPeers([])
    setChat([])
    setReaction(null)
    setLocks(NO_LOCKS)
    setLayoutState(null)
    setSpeaker(null)
    setEngineSpeaker(false)
    setModEvent(null)
    setApp(null)
    setVideoSender(null)
  }

  return {
    state,
    error,
    forbidden,
    role,
    selfId,
    peers,
    tracks,
    chat,
    reaction,
    localStream,
    localScreen,
    remoteVideo,
    remoteAudio,
    localOn,
    remotePaused,
    pending,
    published,
    pubBusy,
    join,
    leave,
    setMedia,
    addMedia,
    shareScreen,
    sendChat,
    retryChat,
    setHand,
    lowerAll,
    setPeerRole,
    end,
    react,
    pubStats,
    setLayer,
    quality,
    qualityCap,
    setQualityCap,
    locks,
    layout,
    speaker,
    engineSpeaker,
    modEvent,
    mutePeer,
    askUnmute,
    muteAll,
    setLayout,
    screenProducerId,
    appSupported,
    sendApp,
    subscribeApp,
    videoSender,
  }
}
