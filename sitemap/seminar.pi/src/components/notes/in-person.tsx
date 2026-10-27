'use client'
// 대면 회의 노트(설계서 15.10, SA2) — 화상 연결 없이 마이크만. 제목 + 참석자 고지 체크 → [기록 시작](탭 = 마이크 권한 제스처)
//  → POST /api/notes{title}(ADMIN) → POST /api/speech/agree{ntId}(NOTE_NOTICE) → useSpeech(field 'ntId', 5초 조각) → 최근 3문장
//  → [종료하고 회의록 만들기] = /api/notes/[id]/end(keepalive) 후 회의록 화면(/notes/[id], 만드는 중 상태)으로 이동.
//  비로그인 = LoginGate, ADMIN 아님 = 안내(redirect 없음). 내 회의록 목록(NoteList)은 /notes 와 이 화면 '최근 노트'가 같이 쓴다
import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { LoginGate } from '@/components/login-gate'
import { pickAudioMime, useSpeech } from '@/components/room/use-speech'
import { Pagination } from '@/components/seminar/pagination'
import { BTN, BTN_PRIMARY } from '@/components/seminar/shared'
import { Link, useRouter } from '@/i18n/navigation'
import { readApi, useApiErrorText } from '@/lib/client-api'
import { NOTE_LIST_PAGE } from '@/lib/note-rules'

const noSend = async () => null // 대면 노트는 방송(자막) 없음

function endNote(id: string) {
  // 이동·창 닫기 직후에도 끝까지 가게 keepalive(본문 없음)
  void piFetch(`/api/notes/${id}/end`, {
    method: 'POST',
    keepalive: true,
  }).catch(() => null)
}

const mmss = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

export function InPersonNote() {
  const t = useTranslations('notes')
  return (
    <LoginGate>
      {(user) =>
        user.role === 'ADMIN' || user.role === 'MASTER' ? (
          <div className="space-y-8">
            <Recorder />
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

  const { limited } = useSpeech({
    track,
    seminarId: ntId ?? '',
    field: 'ntId',
    lang: locale,
    on: !!ntId,
    broadcast: false,
    sendApp: noSend,
    onText: (text) => setLines((l) => [...l, text].slice(-3)),
    onNoAgr: () => setErr(t('noAgr')),
  })

  // 기록 중 — 경과 시간·화면 꺼짐 막기(기능 탐지)·떠나기 경고·창 닫힘이면 keepalive 로 끝내기(RECORDING 고착 방지)
  useEffect(() => {
    if (!ntId) return
    const t0 = Date.now()
    const tick = setInterval(
      () => setSec(Math.floor((Date.now() - t0) / 1000)),
      1000,
    )
    let lock: WakeLockSentinel | null = null
    const wake = () => {
      if (!('wakeLock' in navigator)) return setNoWake(true)
      navigator.wakeLock.request('screen').then(
        (l) => (lock = l),
        () => setNoWake(true),
      )
    }
    const vis = () => document.visibilityState === 'visible' && wake() // 탭 전환 후 잠금이 풀리면 다시
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    const bye = () => endNote(ntId)
    wake()
    document.addEventListener('visibilitychange', vis)
    window.addEventListener('beforeunload', warn)
    window.addEventListener('pagehide', bye)
    return () => {
      clearInterval(tick)
      void lock?.release().catch(() => null)
      document.removeEventListener('visibilitychange', vis)
      window.removeEventListener('beforeunload', warn)
      window.removeEventListener('pagehide', bye)
    }
  }, [ntId])

  // 화면을 떠나면 마이크를 놓는다
  useEffect(() => () => track?.stop(), [track])

  async function start() {
    setErr(null)
    if (!pickAudioMime() || !navigator.mediaDevices?.getUserMedia)
      return setErr(t('unsupported'))
    setBusy(true)
    try {
      const stream = await navigator.mediaDevices
        .getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
        .catch(() => null)
      if (!stream) return setErr(t('micDenied'))
      const stopMic = () => stream.getTracks().forEach((x) => x.stop())
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
      const a = await readApi(
        piFetch('/api/speech/agree', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ntId: r.data.ntId, agree: true }),
        }),
      )
      if (!a.ok) {
        stopMic()
        endNote(r.data.ntId) // 빈 회의록을 RECORDING 으로 남기지 않는다
        return setErr(errText(a.body))
      }
      setTrack(stream.getAudioTracks()[0] ?? null)
      setNtId(r.data.ntId)
    } finally {
      setBusy(false)
    }
  }

  function finish() {
    if (!ntId) return
    // ponytail: 끄기 직전 녹음 중이던 조각(≤5초)은 끝내기와 경합해 빠질 수 있다 — 문제가 되면 마지막 업로드 완료를 기다린 뒤 end
    endNote(ntId)
    router.push(`/notes/${ntId}`)
  }

  if (ntId)
    return (
      <section className="bg-surface space-y-4 rounded-xl p-4">
        <p className="bg-danger inline-flex rounded-full px-3 py-1 text-sm font-semibold text-white">
          ● {t('recBadge', { time: mmss(sec) })}
        </p>
        <div className="space-y-1">
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
        {(err || limited) && (
          <p role="alert" className="text-danger text-sm">
            {err ?? t('limited')}
          </p>
        )}
        <button
          type="button"
          className={`${BTN_PRIMARY} w-full`}
          onClick={finish}
        >
          ■ {t('end')}
        </button>
        {noWake && (
          <p className="text-muted-foreground text-xs">{t('wakeWarn')}</p>
        )}
      </section>
    )

  return (
    <section className="bg-surface space-y-4 rounded-xl p-4">
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
        type="button"
        className={`${BTN_PRIMARY} w-full`}
        disabled={busy || !told || !title.trim()}
        onClick={() => void start()}
      >
        {busy ? t('starting') : `● ${t('start')}`}
      </button>
      {err && (
        <p role="alert" className="text-danger text-sm">
          {err}
        </p>
      )}
    </section>
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
  }, [page])

  if (err) return <p className="text-sm">{t('error')}</p>
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

export function NotesHome() {
  const t = useTranslations('notes')
  return (
    <LoginGate>
      {(user) => (
        <div className="space-y-4">
          {(user.role === 'ADMIN' || user.role === 'MASTER') && (
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
