'use client'
// M1 SFU 실험실 — 발표자/청중 선택 → 엔진 /signal(WebSocket) 접속 → 발표자는 카메라 송신(발행 PC = 클라이언트 offer),
// 청중은 서버 offer 로 수신(구독 PC, PRD_02 D-2). 입장은 로그인 입장권(/api/media/ticket) 우선, 발급 실패 시에만 개발용 입장
// (엔진 MEDIA_DEV_TICKET=1 일 때만 통과 — 운영 엔진은 거부). 봉투 {t,id,m,ok,d,e}·메시지 이름은 media/internal/signal/envelope.go 와 같다(PRD_02 5절)
import { useEffect, useRef, useState } from 'react'
import { piFetch } from '@pi/auth/client'

type Role = 'presenter' | 'audience'
type Env = { t: 'req' | 'res' | 'ntf'; id?: number; m?: string; ok?: boolean; d?: unknown; e?: { code: string; msg: string } }
type Trickle = { pc: 'pub' | 'sub'; candidate: RTCIceCandidateInit }

const REQ_TIMEOUT_MS = 10000

// 엔진 주소 — env 기본값, 화면에서 바꿀 수 있음(시험용 임시 터널 주소는 매번 바뀌어 재배포 없이 입력). ws:// · wss:// 만 허용
const WS_RE = /^wss?:\/\/[^\s]+$/

// 로그인 입장권 — 미로그인(401)·발표 권한 없음(403)·서버 키 미설정(503)이면 null(개발용 입장으로 넘어감)
async function fetchTicket(room: string, role: Role): Promise<{ ticket?: string; why?: string }> {
  const r = await piFetch('/api/media/ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room, cap: role === 'presenter' ? 'present' : 'watch' }),
  }).catch(() => null)
  if (!r) return { why: '네트워크 오류' }
  if (!r.ok) return { why: `${r.status}` }
  const j = (await r.json().catch(() => null)) as { ticket?: string } | null
  return j?.ticket ? { ticket: j.ticket } : { why: '응답 형식' }
}

export function SfuLab({ wsUrl: envWsUrl }: { wsUrl?: string }) {
  const [wsInput, setWsInput] = useState(envWsUrl ?? '')
  const wsUrl = WS_RE.test(wsInput.trim()) ? wsInput.trim() : undefined
  const localRef = useRef<HTMLVideoElement>(null)
  const remoteRef = useRef<HTMLVideoElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const pubRef = useRef<RTCPeerConnection | null>(null)
  const subRef = useRef<RTCPeerConnection | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const pendingRef = useRef(new Map<number, (e: Env) => void>())
  const iceWait = useRef<{ pub: RTCIceCandidateInit[]; sub: RTCIceCandidateInit[] }>({ pub: [], sub: [] })
  const nextId = useRef(1)
  const [role, setRole] = useState<Role>('audience')
  const [room, setRoom] = useState('lab-1')
  const [name, setName] = useState(() => `시험${Math.floor(Math.random() * 900 + 100)}`)
  const [state, setState] = useState('대기')
  const [needTap, setNeedTap] = useState(false)
  const [log, setLog] = useState<string[]>([])

  const add = (m: string) => setLog((l) => [...l, `${new Date().toLocaleTimeString()} ${m}`].slice(-80))

  useEffect(() => () => leave(), []) // eslint-disable-line react-hooks/exhaustive-deps

  function send(e: Env) {
    wsRef.current?.send(JSON.stringify(e))
  }

  function request<T>(m: string, d: unknown): Promise<T> {
    const id = nextId.current++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRef.current.delete(id)
        reject(new Error(`${m} 응답 없음`))
      }, REQ_TIMEOUT_MS)
      pendingRef.current.set(id, (e) => {
        clearTimeout(timer)
        if (e.ok) resolve(e.d as T)
        else reject(new Error(`${e.e?.code} ${e.e?.msg}`))
      })
      send({ t: 'req', id, m, d })
    })
  }

  function newPC(kind: 'pub' | 'sub', iceServers: RTCIceServer[]) {
    const pc = new RTCPeerConnection({ iceServers })
    pc.onicecandidate = (ev) => {
      if (ev.candidate) send({ t: 'ntf', m: 'trickle', d: { pc: kind, candidate: ev.candidate.toJSON() } })
    }
    pc.onconnectionstatechange = () => {
      add(`${kind === 'pub' ? '발행' : '구독'} PC ${pc.connectionState}`)
      setState(`${kind === 'pub' ? '발행' : '구독'} ${pc.connectionState}`)
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
      const c = e.d as { consumerId: string; kind: string; mid: string }
      add(`구독 생성 ${c.kind} mid=${c.mid}`)
    } else if (e.m === 'transport.subscribe') {
      // 서버 offer → answer(구독 PC 재협상)
      const pc = subRef.current
      if (!pc) return
      await pc.setRemoteDescription({ type: 'offer', sdp: (e.d as { sdp: string }).sdp })
      await flushIce('sub')
      const ans = await pc.createAnswer()
      await pc.setLocalDescription(ans)
      await request('transport.subscribe.answer', { sdp: ans.sdp })
      add('구독 offer 응답 완료')
    } else if (e.m === 'error') {
      const er = e.d as { code: string; msg: string }
      add(`서버 오류 ${er.code} ${er.msg}`)
    } else {
      add(`알림 ${e.m}`)
    }
  }

  async function join() {
    if (!wsUrl) return add('엔진 주소 없음 — ws:// 또는 wss:// 로 시작하는 주소를 입력하세요')
    leave()
    setState('입장권 발급 중')
    // 입장권(60초·1회용)은 WebSocket 열기 직전에 받는다
    const tk = await fetchTicket(room, role)
    add(tk.ticket ? '입장권 발급됨' : `입장권 없음(${tk.why}) — 개발용 입장 시도(운영 엔진은 거부)`)
    setState('접속 중')
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
        onNtf(e).catch((err: Error) => add(`알림 처리 실패 ${err.message}`))
      }
    }
    ws.onclose = () => {
      add('시그널링 끊김')
      setState('끊김')
    }
    try {
      // 연결 실패(터널 꺼짐·주소 오타·엔진 Origin 거부 403)도 로그에 남긴다
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve()
        ws.onerror = () => reject(new Error('WebSocket 연결 실패'))
      })
      const res = await request<{ peerId: string; iceServers: RTCIceServer[]; producers: unknown[] }>(
        'join',
        tk.ticket ? { ticket: tk.ticket } : { room, role, name },
      )
      add(`입장 peer=${res.peerId} 기존 발행 ${res.producers.length}개`)
      setState('입장')
      // 구독 PC 는 모든 참가자에게 서버 offer 로 생긴다
      const sub = newPC('sub', res.iceServers)
      subRef.current = sub
      sub.ontrack = (ev) => {
        add(`수신 트랙 ${ev.track.kind}`)
        const el = remoteRef.current!
        const s = (el.srcObject as MediaStream | null) ?? new MediaStream()
        s.addTrack(ev.track)
        el.srcObject = s
        el.play().then(
          () => setNeedTap(false),
          () => setNeedTap(true),
        )
      }
      if (role === 'presenter') await publish(res.iceServers)
    } catch (e) {
      add(`입장 실패 ${(e as Error).message}`)
      setState('실패')
    }
  }

  async function publish(iceServers: RTCIceServer[]) {
    const s = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    })
    streamRef.current = s
    const el = localRef.current!
    el.srcObject = s
    el.play().catch(() => {})
    const pc = newPC('pub', iceServers)
    pubRef.current = pc
    const trs = s.getTracks().map((t) => ({ kind: t.kind, tr: pc.addTransceiver(t, { direction: 'sendonly' }) }))
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    const ans = await request<{ sdp: string }>('transport.publish', { sdp: offer.sdp })
    await pc.setRemoteDescription({ type: 'answer', sdp: ans.sdp })
    await flushIce('pub')
    for (const { kind, tr } of trs) {
      const r = await request<{ producerId: string }>('produce', {
        mid: tr.mid,
        kind,
        source: kind === 'video' ? 'camera' : 'mic',
      })
      add(`발행 ${kind} producer=${r.producerId}`)
    }
  }

  function leave() {
    if (wsRef.current?.readyState === WebSocket.OPEN) send({ t: 'req', id: nextId.current++, m: 'leave', d: {} })
    wsRef.current?.close()
    wsRef.current = null
    pubRef.current?.close()
    subRef.current?.close()
    pubRef.current = subRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    iceWait.current = { pub: [], sub: [] }
    pendingRef.current.clear()
    if (localRef.current) localRef.current.srcObject = null
    if (remoteRef.current) remoteRef.current.srcObject = null
  }

  const btn = 'rounded-md border border-neutral-700 px-3 py-2 text-sm active:bg-neutral-800 disabled:opacity-40'
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">M1 SFU 실험실</h1>
        <p className="text-muted-foreground text-sm">Galápagos 엔진 발표자 1 → 청중 2 영상 점검 (PRD_02 M1)</p>
        <label className="mt-2 flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">엔진 주소 (wss://…/signal)</span>
          <input
            className="rounded-md border border-neutral-700 bg-transparent px-2 py-1 font-mono text-sm"
            value={wsInput}
            onChange={(e) => setWsInput(e.target.value)}
            placeholder="wss://xxxx.trycloudflare.com/signal"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
      </header>

      <section className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {(['presenter', 'audience'] as const).map((r) => (
            <button key={r} className={`${btn} ${role === r ? 'bg-neutral-800' : ''}`} onClick={() => setRole(r)}>
              {r === 'presenter' ? '발표자' : '청중'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className="rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-sm"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            aria-label="방 코드"
          />
          <input
            className="rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="이름"
          />
          <button className={btn} onClick={() => join()} disabled={!wsUrl}>
            입장
          </button>
          <button className={btn} onClick={() => leave()}>
            나가기
          </button>
        </div>
        <p className="text-sm">상태 : {state}</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-sm">내 카메라(발표자)</p>
          <video ref={localRef} className="aspect-video w-full rounded bg-black" muted playsInline />
        </div>
        <div>
          <p className="text-sm">받은 영상(청중)</p>
          <video ref={remoteRef} className="aspect-video w-full rounded bg-black" playsInline />
          {needTap && (
            <button className={btn} onClick={() => remoteRef.current?.play().then(() => setNeedTap(false))}>
              탭하여 재생
            </button>
          )}
        </div>
      </section>

      <section>
        <p className="text-sm font-semibold">로그</p>
        <pre className="max-h-64 overflow-auto rounded border border-neutral-800 p-2 text-xs whitespace-pre-wrap">
          {log.join('\n')}
        </pre>
      </section>
    </div>
  )
}
