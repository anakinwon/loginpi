'use client'
// 대면 회의 노트(설계서 15.10, SA2) — 화상 연결 없이 마이크만. 제목 + 참석자 고지 체크 → [기록 시작](탭 = 마이크 권한 제스처)
//  → POST /api/notes{title}(ADMIN) → POST /api/speech/agree{ntId}(NOTE_NOTICE) → useSpeech(field 'ntId', 5초 조각) → 최근 3문장
//  → [종료하고 회의록 만들기] = /api/notes/[id]/end(keepalive) 후 회의록 화면(/notes/[id], 만드는 중 상태)으로 이동.
//  앱 안 이동으로 떠나면 마지막 조각 뒤 자동 종료, 마이크가 끊기면 [마이크 다시 연결]. 비로그인 = LoginGate, ADMIN 아님 = 안내(redirect 없음). 내 회의록 목록(NoteList)은 /notes 와 이 화면 '최근 노트'가 같이 쓴다
import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { LoginGate } from '@/components/login-gate'
import {
  pickAudioMime,
  UPLOAD_TIMEOUT_MS,
  useSpeech,
} from '@/components/room/use-speech'
import { Pagination } from '@/components/seminar/pagination'
import { BTN, BTN_PRIMARY } from '@/components/seminar/shared'
import { onTrackEnd } from '@/components/room/room-rules'
import { Link, useRouter } from '@/i18n/navigation'
import { readApi, useApiErrorText } from '@/lib/client-api'
import { holdWake, NOTE_LIST_PAGE, recAlert } from '@/lib/note-rules'
import { CHUNK_NOTE_MS, VAD } from '@/lib/speech-rules'

const noSend = async () => null // 대면 노트는 방송(자막) 없음

function endNote(id: string) {
  // 이동·창 닫기 직후에도 끝까지 가게 keepalive(본문 없음)
  void piFetch(`/api/notes/${id}/end`, {
    method: 'POST',
    keepalive: true,
  }).catch(() => null)
}

// 마이크 — 시작·다시 연결이 같이 쓴다. 대면 회의(테이블 위 휴대폰)용 : 소음 제거는 먼 사람 목소리를 잡음으로 깎고,
//  스피커 재생이 없어 에코 제거도 필요 없다(Android 는 켜면 통화용 음성 경로로 바뀌어 처리가 더 강해진다). 작은 목소리를 키우는 자동 음량만 둔다 [확인중 : 실기기]
const MIC: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: true,
}

const REC_MARK = '● ' // 기록 중 탭 제목 앞 표시

const mmss = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

// ai = 서버에 외부 AI 키가 있는가(page 가 geminiEnabled 로 넘김) — 없으면 마이크 권한부터 묻고 503 으로 끝나지 않게
//  [기록 시작] 대신 안내만 둔다(T02 r6). 키는 배포 환경변수라 바뀌면 다시 배포된다
export function InPersonNote({ ai }: { ai: boolean }) {
  const t = useTranslations('notes')
  return (
    <LoginGate>
      {(user) =>
        user.role === 'ADMIN' || user.role === 'MASTER' ? (
          <div className="space-y-8">
            {ai ? (
              <Recorder />
            ) : (
              <p role="status" className="bg-surface rounded-xl p-4 text-sm">
                {t('aiOff')}
              </p>
            )}
            <section className="space-y-3">
              <h2 className="font-semibold">{t('recentNotes')}</h2>
              <NoteList />
            </section>
          </div>
        ) : (
          <p role="alert" className="bg-surface rounded-xl p-4 text-sm">
            {t('adminOnly')}
          </p>
        )
      }
    </LoginGate>
  )
}

function Recorder() {
  const t = useTranslations('notes')
  const locale = useLocale()
  const router = useRouter()
  const errText = useApiErrorText()
  const [title, setTitle] = useState('')
  const [told, setTold] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ntId, setNtId] = useState<string | null>(null)
  const [track, setTrack] = useState<MediaStreamTrack | null>(null)
  const [lines, setLines] = useState<string[]>([])
  const [sec, setSec] = useState(0)
  const [noWake, setNoWake] = useState(false)

  const [finishing, setFinishing] = useState(false)
  const [micLost, setMicLost] = useState(false)
  const [gone, setGone] = useState(false) // 노트가 다른 곳에서 끝났거나 삭제됐다(서버가 조각을 멈춤)
  // 서버가 조각을 멈췄다(한도·고지 기록 없음·끝남·삭제) — 더는 기록되지 않는다. 전에는 한도·고지 없음이면 '● 기록 중' 타이머·탭 표시가
  //  계속 돌고 마이크도 켜진 채였다(T02 r5). gone 과 달리 회의록은 아직 RECORDING 이라 떠나면 그대로 끝내기 요청을 보낸다
  const [halted, setHalted] = useState(false)
  const [fixing, setFixing] = useState(false) // [마이크 다시 연결] 권한 창 대기 중 — 연타로 마이크 2개를 잡지 않게
  const left = useRef(false) // 화면을 떠났다 — 개발 StrictMode 의 즉시 재실행과 진짜 떠남을 가른다
  const ended = useRef(false) // 끝내기 요청을 이미 보냄(종료 버튼·창 닫힘)
  // 화면이 살아 있다 — 시작·다시 연결의 마이크 권한 창·API 대기 중에 앱 안 이동으로 떠나면, 늦게 온 마이크를 놓고
  //  만든 회의록을 RECORDING 으로 남기지 않는다(전에는 마이크 표시가 계속 켜져 있고 회의록이 '기록 중'으로 고착 — T02 r4)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const { limited, flush } = useSpeech({
    track,
    seminarId: ntId ?? '',
    field: 'ntId',
    chunkMs: CHUNK_NOTE_MS,
    vadLevel: VAD.noteLevel,
    title: title.trim(),
    lang: locale,
    on: !!ntId,
    broadcast: false,
    sendApp: noSend,
    onText: (text) => setLines((l) => [...l, text].slice(-3)),
    onNoAgr: () => setErr(t('noAgr')),
    // 다른 기기·회의록 화면에서 끝냈거나 지웠다 — '기록 중'으로 두지 않고 알리며 마이크를 놓는다(트랙 정리 effect 가 stop)
    onHalt: (why) => {
      setHalted(true)
      setTrack(null) // 마이크를 놓는다(트랙 정리 effect 가 stop)
      if (why !== 'live' && why !== 'gone') return
      ended.current = true // 떠날 때 끝내기 요청을 또 보내지 않는다([종료] 버튼은 그대로 회의록 화면으로)
      setGone(true)
    },
  })

  // 기록 중 — 경과 시간·화면 꺼짐 막기(기능 탐지)·떠나기 경고·창 닫힘이면 keepalive 로 끝내기(RECORDING 고착 방지)
  useEffect(() => {
    if (!ntId) return
    left.current = false
    const t0 = Date.now()
    const tick = setInterval(
      () => setSec(Math.floor((Date.now() - t0) / 1000)),
      1000,
    )
    const wake = holdWake(navigator, () => setNoWake(true))
    const vis = () => document.visibilityState === 'visible' && wake.again() // 탭 전환 후 잠금이 풀리면 다시
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    const bye = () => {
      ended.current = true
      endNote(ntId)
    }
    document.addEventListener('visibilitychange', vis)
    window.addEventListener('beforeunload', warn)
    window.addEventListener('pagehide', bye)
    return () => {
      clearInterval(tick)
      wake.release()
      document.removeEventListener('visibilitychange', vis)
      window.removeEventListener('beforeunload', warn)
      window.removeEventListener('pagehide', bye)
      // 앱 안 이동(헤더 링크·언어 바꾸기)은 pagehide·beforeunload 가 없다 — 마이크만 놓이고 회의록이 RECORDING 으로 남았다(T02 r2).
      //  진짜 떠남이면 useSpeech 정리가 보낸 마지막 조각 업로드를 기다린 뒤 끝낸다. StrictMode 재실행은 1초 안에 left 가 false 로 돌아와 거른다
      left.current = true
      setTimeout(() => {
        if (!left.current || ended.current) return
        ended.current = true
        void flush(UPLOAD_TIMEOUT_MS).then(() => endNote(ntId))
      }, 1000)
    }
  }, [ntId, flush])

  // 탭 제목 앞 '● ' — 다른 탭에 가 있어도 아직 기록 중임을 탭 목록에서 본다(보강 T02 r4). 끝났거나(gone) 떠나면 뗀다.
  //  앱 안 이동으로 새 화면 제목이 먼저 들어와 있으면 표시가 없으니 건드리지 않는다
  useEffect(() => {
    if (!ntId || halted) return
    if (!document.title.startsWith(REC_MARK))
      document.title = REC_MARK + document.title
    return () => {
      if (document.title.startsWith(REC_MARK))
        document.title = document.title.slice(REC_MARK.length)
    }
  }, [ntId, halted])

  // 화면을 떠나면 마이크를 놓는다
  useEffect(() => () => track?.stop(), [track])

  // 마이크가 끊기면(블루투스 해제·다른 앱이 마이크 점유·권한 회수) 조각이 조용히 멈춘다 — 타이머만 도는 '기록 중'으로 두지 않고 알린다.
  //  내 stop() 은 ended 를 쏘지 않아 화면 이탈과 섞이지 않는다
  useEffect(() => {
    if (!track) return
    // 마이크를 받은 직후(첫 렌더 전)에 이미 끝났어도 놓치지 않는다(onTrackEnd)
    return onTrackEnd(track, () => setMicLost(true))
  }, [track])

  async function start() {
    setErr(null)
    if (!pickAudioMime() || !navigator.mediaDevices?.getUserMedia)
      return setErr(t('unsupported'))
    setBusy(true)
    try {
      const stream = await navigator.mediaDevices
        .getUserMedia({ audio: MIC })
        .catch(() => null)
      if (!stream) return setErr(t('micDenied'))
      const stopMic = () => stream.getTracks().forEach((x) => x.stop())
      if (!alive.current) return stopMic()
      const r = await readApi<{ ntId: string }>(
        piFetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim() }),
        }),
      )
      if (!r.ok) {
        stopMic()
        return setErr(errText(r.body))
      }
      if (!alive.current) {
        stopMic()
        return endNote(r.data.ntId)
      }
      const a = await readApi(
        piFetch('/api/speech/agree', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ntId: r.data.ntId, agree: true }),
        }),
      )
      if (!a.ok || !alive.current) {
        stopMic()
        endNote(r.data.ntId) // 빈 회의록을 RECORDING 으로 남기지 않는다
        return a.ok ? undefined : setErr(errText(a.body))
      }
      setTrack(stream.getAudioTracks()[0] ?? null)
      setNtId(r.data.ntId)
    } finally {
      setBusy(false)
    }
  }

  async function finish() {
    if (!ntId || finishing) return
    // 녹음 중이던 마지막 조각(≤5초)과 진행 중 업로드(외부 AI ≤10초)가 회의록에 들어간 뒤 요약을 시작한다 — 먼저 끝내면
    //  서버가 RECORDING 아님(SPEECH_NOT_LIVE)으로 거절하거나 요약 뒤에 저장돼 마지막 말이 요약에서 빠진다(T02 r1).
    //  상한(업로드 시간 제한)을 넘으면 그래도 끝낸다
    setFinishing(true)
    ended.current = true
    await flush(UPLOAD_TIMEOUT_MS)
    endNote(ntId)
    router.push(`/notes/${ntId}`)
  }

  // 끊긴 마이크를 다시 잡는다(탭 = 권한 제스처) — 새 트랙이면 useSpeech 가 같은 회의록에 이어서 조각을 보낸다
  //  권한 창을 기다리는 동안 [종료]를 눌렀거나 노트가 끝났으면(ended) 늦게 온 마이크는 놓는다 — 끝낸 회의록에 녹음을 다시 시작하지 않게(T02 r5)
  async function reconnect() {
    setFixing(true)
    const s = await navigator.mediaDevices
      .getUserMedia({ audio: MIC })
      .catch(() => null)
    setFixing(false)
    if (!s) return setErr(t('micDenied'))
    if (!alive.current || ended.current)
      return s.getTracks().forEach((x) => x.stop())
    setErr(null)
    setMicLost(false)
    setTrack(s.getAudioTracks()[0] ?? null)
  }

  const alert = recAlert({ err, limited, micLost, gone })
  if (ntId)
    return (
      <section className="bg-surface space-y-4 rounded-xl p-4">
        {!halted && (
          <p className="bg-danger inline-flex rounded-full px-3 py-1 text-sm font-semibold text-white">
            ● {t('recBadge', { time: mmss(sec) })}
          </p>
        )}
        {/* 화면 낭독기 사용자도 기록이 실제로 되는지 듣는다 — 새 문장만 읽게(aria-relevant additions) */}
        <div
          className="space-y-1"
          aria-live="polite"
          aria-relevant="additions"
        >
          <h2 className="text-muted-foreground text-xs">{t('recentLines')}</h2>
          {lines.length ? (
            lines.map((l, i) => (
              <p key={i} className="text-sm">
                {l}
              </p>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">{t('waiting')}</p>
          )}
        </div>
        {alert && (
          <p role="alert" className="text-danger text-sm">
            {alert === 'err' ? err : t(alert)}
          </p>
        )}
        {micLost && !halted && !finishing && (
          <button
            type="button"
            className={`${BTN} w-full`}
            disabled={fixing}
            onClick={() => void reconnect()}
          >
            {t('micRetry')}
          </button>
        )}
        <button
          type="button"
          className={`${BTN_PRIMARY} w-full`}
          disabled={finishing}
          onClick={() => void finish()}
        >
          {finishing ? t('finishing') : `■ ${t('end')}`}
        </button>
        {noWake && (
          <p className="text-muted-foreground text-xs">{t('wakeWarn')}</p>
        )}
      </section>
    )

  // 제목 칸에서 Enter = [기록 시작](form 제출 — 키 입력도 마이크 권한 제스처, 보강 T02 r5). 비활성 조건은 버튼과 같다
  const ready = !busy && told && !!title.trim()
  return (
    <form
      className="bg-surface space-y-4 rounded-xl p-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (ready) void start()
      }}
    >
      <label className="block space-y-1 text-sm">
        <span>{t('titleLabel')}</span>
        <input
          className="bg-surface-raised h-10 w-full rounded-lg px-3"
          value={title}
          maxLength={100}
          placeholder={t('titlePh')}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={told}
          onChange={(e) => setTold(e.target.checked)}
        />
        <span>{t('told')}</span>
      </label>
      <p className="text-muted-foreground text-xs">{t('toldWhy')}</p>
      <button
        type="submit"
        className={`${BTN_PRIMARY} w-full`}
        disabled={!ready}
      >
        {busy ? t('starting') : `● ${t('start')}`}
      </button>
      {err && (
        <p role="alert" className="text-danger text-sm">
          {err}
        </p>
      )}
    </form>
  )
}

type Item = {
  id: string
  smnId: string | null
  title: string
  start: string
  status: string
}

// 내 회의록(최근순 10건씩, 데이터 패칭 표준 ①)
export function NoteList() {
  const t = useTranslations('notes')
  const locale = useLocale()
  const [page, setPage] = useState(1)
  const [res, setRes] = useState<{ notes: Item[]; total: number } | null>(null)
  const [err, setErr] = useState(false)
  const [tries, setTries] = useState(0) // [다시 불러오기] — 일시 오류(네트워크·429) 뒤 새로고침 없이(보강 T02 r6)
  useEffect(() => {
    let live = true
    void readApi<{ notes: Item[]; total: number }>(
      piFetch(`/api/notes?page=${page}`),
    ).then((r) => {
      if (!live) return
      if (r.ok) setRes(r.data)
      else setErr(true)
    })
    return () => {
      live = false
    }
  }, [page, tries])

  if (err)
    return (
      <p role="alert" className="flex items-center gap-3 text-sm">
        {t('error')}
        <button
          type="button"
          className={BTN}
          onClick={() => {
            setErr(false)
            setRes(null)
            setTries((n) => n + 1)
          }}
        >
          {t('reload')}
        </button>
      </p>
    )
  if (!res)
    return <p className="text-muted-foreground text-sm">{t('loading')}</p>
  if (!res.total)
    return <p className="text-muted-foreground text-sm">{t('empty')}</p>
  return (
    <div className="space-y-3">
      <ul className="bg-surface divide-y divide-white/5 rounded-xl">
        {res.notes.map((n) => (
          <li key={n.id}>
            <Link
              href={`/notes/${n.id}`}
              className="flex items-center gap-3 p-3 text-sm hover:underline"
            >
              <span className="text-muted-foreground shrink-0 text-xs">
                {new Date(n.start).toLocaleString(locale, {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </span>
              <span className="min-w-0 flex-1 truncate">{n.title}</span>
              {!n.smnId && (
                <span className="text-muted-foreground text-xs">
                  {t('inPersonTag')}
                </span>
              )}
              <span className="text-muted-foreground text-xs">
                {t.has(`st.${n.status}`) ? t(`st.${n.status}`) : n.status}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Pagination
        page={page}
        pages={Math.ceil(res.total / NOTE_LIST_PAGE)}
        onPage={setPage}
      />
    </div>
  )
}

export function NotesHome({ ai }: { ai: boolean }) {
  const t = useTranslations('notes')
  return (
    <LoginGate>
      {(user) => (
        <div className="space-y-4">
          {ai && (user.role === 'ADMIN' || user.role === 'MASTER') && (
            <Link href="/notes/new" className={BTN}>
              {t('newNote')}
            </Link>
          )}
          <NoteList />
        </div>
      )}
    </LoginGate>
  )
}
