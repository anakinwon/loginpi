'use client'
// M1 SFU 실험실 — 발표자/청중 선택 → 엔진 /signal(WebSocket) 접속 → 발표자는 카메라 송신, 청중은 서버 offer 로 수신(PRD_02 D-2).
// 연결 로직은 룸 화면과 같은 useRoom 훅(src/components/room/use-room.ts). 입장은 로그인 입장권 우선, 발급 실패 시에만 개발용 입장
// (엔진 MEDIA_DEV_TICKET=1 일 때만 통과 — 운영 엔진은 거부). 실험 화면이라 문구는 한국어 고정
import { useRef, useState } from 'react'
import { StreamVideo, useRemoteAudio } from '@/components/room/stage'
import { useRoom, type Role } from '@/components/room/use-room'

// 엔진 주소 — env 기본값, 화면에서 바꿀 수 있음(시험용 임시 터널 주소는 매번 바뀌어 재배포 없이 입력). ws:// · wss:// 만 허용
const WS_RE = /^wss?:\/\/[^\s]+$/

export function SfuLab({ wsUrl: envWsUrl }: { wsUrl?: string }) {
  const [wsInput, setWsInput] = useState(envWsUrl ?? '')
  const wsUrl = WS_RE.test(wsInput.trim()) ? wsInput.trim() : undefined
  const [role, setRole] = useState<Role>('audience')
  const [room, setRoom] = useState('lab-1')
  const [name, setName] = useState(() => `시험${Math.floor(Math.random() * 900 + 100)}`)
  const [log, setLog] = useState<string[]>([])
  const add = (m: string) => setLog((l) => [...l, `${new Date().toLocaleTimeString()} ${m}`].slice(-80))
  const r = useRoom({ wsUrl, onLog: add })
  const audioRef = useRef<HTMLAudioElement>(null)
  const sound = useRemoteAudio(audioRef, r.remoteAudio)

  function join() {
    if (!wsUrl) return add('엔진 주소 없음 — ws:// 또는 wss:// 로 시작하는 주소를 입력하세요')
    // 입장 탭 안에서 소리 요소 재생 — 자동재생 허용 확보
    const el = audioRef.current
    if (el) {
      if (!el.srcObject) el.srcObject = new MediaStream()
      el.play().catch(() => {})
    }
    void r.join(room, role, undefined, name) // undefined = 발표자면 훅이 카메라 요청
  }

  const btn = 'rounded-md border border-neutral-700 px-3 py-2 text-sm active:bg-neutral-800 disabled:opacity-40'
  return (
    <div className="space-y-5">
      <audio ref={audioRef} autoPlay />
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
          {(['presenter', 'audience'] as const).map((x) => (
            <button key={x} className={`${btn} ${role === x ? 'bg-neutral-800' : ''}`} onClick={() => setRole(x)}>
              {x === 'presenter' ? '발표자' : '청중'}
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
          <button className={btn} onClick={join} disabled={!wsUrl}>
            입장
          </button>
          <button className={btn} onClick={r.leave}>
            나가기
          </button>
        </div>
        <p className="text-sm">
          상태 : {r.state}
          {r.error ? ` (${r.error})` : ''}
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-sm">내 카메라(발표자)</p>
          <div className="aspect-video w-full overflow-hidden rounded bg-black">
            <StreamVideo stream={r.localStream} />
          </div>
        </div>
        <div>
          <p className="text-sm">받은 영상(청중)</p>
          <div className="aspect-video w-full overflow-hidden rounded bg-black">
            <StreamVideo stream={r.remoteVideo} />
          </div>
          {sound.blocked && (
            <button className={btn} onClick={() => void sound.enable()}>
              탭하여 소리 재생
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
