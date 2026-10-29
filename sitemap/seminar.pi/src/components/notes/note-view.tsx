'use client'
// 회의록 화면(설계서 15.9) — 머리(제목·시각·길이·AI 고지) → 요약(요점·결정·할 일) → 화면 캡처(화면에 들어오기 직전 조회) → 전체 기록(50줄 쪽, 같은 방식)
//  → [Markdown 내려받기](piFetch → Blob → 객체 URL — <a download> 는 X-Pi-Token 을 못 붙인다). 비로그인 = LoginGate(redirect 없음).
//  상태 : 만드는 중 = 5초 간격 조회·최대 2분(넘으면 새로 고침 안내) / 실패 = 안내 + 관리 권한자에게 [다시 만들기] / 완료
//  [회의록 삭제] = 기록 시작자·ADMIN(head.del) — 두 번 눌러 확인(window.confirm 은 WebView 가 막을 수 있어 쓰지 않음) → DELETE → 내 회의록 목록
import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { LoginGate } from '@/components/login-gate'
import { Pagination } from '@/components/seminar/pagination'
import { BTN, BTN_PRIMARY } from '@/components/seminar/shared'
import { Link, useRouter } from '@/i18n/navigation'
import { readApi } from '@/lib/client-api'
import {
  emptySummary,
  headFatal,
  hhmm,
  pollDelay,
  SEG_PAGE,
} from '@/lib/note-rules'

type Head = {
  title: string
  smnId: string | null
  start: string
  end: string | null
  status: 'RECORDING' | 'SUMMARIZING' | 'DONE' | 'FAILED'
  summary: { points: string[]; decisions: string[]; todos: string[] } | null
  manage: boolean
  del: boolean
}

// 화면에 들어오기 직전(200px 앞) 한 번 true — 데이터 패칭 표준 ③
export function useVisible<T extends Element>() {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    if (typeof IntersectionObserver === 'undefined') return setSeen(true)
    const io = new IntersectionObserver(
      (es) => es.some((e) => e.isIntersecting) && setSeen(true),
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  return [ref, seen] as const
}

// 상세(S2) [회의록 보기] — 내가 볼 수 있는 이 세미나의 최근 회의록이 있을 때만(설계서 15.8). 로그인 사용자만 부른다
export function NoteLink({ smnId }: { smnId: string }) {
  const t = useTranslations('notes')
  const [ntId, setNtId] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void readApi<{ ntId: string | null }>(
      piFetch(`/api/notes?smnId=${smnId}`),
    ).then((r) => live && r.ok && setNtId(r.data.ntId))
    return () => {
      live = false
    }
  }, [smnId])
  if (!ntId) return null
  return (
    <Link href={`/notes/${ntId}`} className={BTN}>
      {t('view')}
    </Link>
  )
}

export function NoteView({ id }: { id: string }) {
  return <LoginGate>{() => <Note id={id} />}</LoginGate>
}

function Note({ id }: { id: string }) {
  const t = useTranslations('notes')
  const locale = useLocale()
  const [head, setHead] = useState<Head | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [long, setLong] = useState(false)
  const since = useRef(Date.now())
  const seenSts = useRef<string | null>(null)
  const router = useRouter()
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [delErr, setDelErr] = useState(false)
  const [dlErr, setDlErr] = useState(false)
  const loaded = useRef(false)

  useEffect(() => {
    let live = true
    void readApi<Head>(piFetch(`/api/notes/${id}`)).then((r) => {
      if (!live) return
      if (r.ok) {
        loaded.current = true
        return setHead(r.data)
      }
      // 상태 조회 일시 오류 — 화면을 두고(새 객체로 조회 효과를 다시 걸어) 다음 조회를 이어 간다(headFatal)
      if (!headFatal(r.status, loaded.current))
        return setHead((h) => h && { ...h })
      setErr(
        t(
          r.status === 404
            ? 'notFound'
            : r.status === 403
              ? 'forbidden'
              : 'error',
        ),
      )
    })
    return () => {
      live = false
    }
  }, [id, tick, t])

  // 만드는 중이면 5초마다 다시 본다(최대 2분). 기록 중도 본다 — 대면 노트 [종료] 직후 끝내기 요청보다 조회가 먼저 닿는 경합.
  //  기준 시각은 상태가 바뀔 때 다시 잡는다(pollDelay, r6 T07)
  useEffect(() => {
    if (!head) return
    if (head.status !== seenSts.current) {
      seenSts.current = head.status
      since.current = Date.now()
    }
    const delay = pollDelay(head.status, since.current, Date.now())
    if (delay === null) return setLong(head.status === 'SUMMARIZING')
    // 숨은 탭(다른 앱·탭으로 전환)은 조회를 쉬고, 다시 보일 때 바로 1번 본다(보강 r5 T07 — 뒤에 둔 탭의 5초 조회 부하)
    const next = () => setTick((n) => n + 1)
    const onShow = () => {
      if (document.visibilityState === 'hidden') return
      document.removeEventListener('visibilitychange', onShow)
      next()
    }
    const tm = setTimeout(() => {
      if (document.visibilityState === 'hidden')
        document.addEventListener('visibilitychange', onShow)
      else next()
    }, delay)
    return () => {
      clearTimeout(tm)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [head])

  const retry = async () => {
    since.current = Date.now()
    setLong(false)
    setHead((h) => (h ? { ...h, status: 'SUMMARIZING' } : h))
    await piFetch(`/api/notes/${id}/end`, { method: 'POST' }).catch(() => null)
    setTick((n) => n + 1)
  }

  const download = async () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const r = await piFetch(
      `/api/notes/${id}?part=md&lang=${locale}&tz=${encodeURIComponent(tz)}`,
    ).catch(() => null)
    // 실패는 내려받기 버튼 아래에만(회의록 본문은 그대로 — 삭제 실패와 같은 규칙)
    setDlErr(!r?.ok)
    if (!r?.ok) return
    const url = URL.createObjectURL(await r.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = `${(head?.title || 'notes').replace(/[\\/:*?"<>|]/g, '_')}.md`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const remove = async () => {
    setBusy(true)
    const r = await piFetch(`/api/notes/${id}`, { method: 'DELETE' }).catch(
      () => null,
    )
    setBusy(false)
    // 실패는 삭제 영역 안에만(회의록 본문은 그대로) — 확인 단계를 닫아 다시 누를 수 있게
    if (!r?.ok) {
      setAsk(false)
      return setDelErr(true)
    }
    router.push('/notes')
  }

  if (err)
    return (
      <p role="alert" className="bg-surface rounded-xl p-4 text-sm">
        {err}
      </p>
    )
  if (!head)
    return <p className="text-muted-foreground text-sm">{t('loading')}</p>

  const min = Math.max(
    1,
    Math.round(
      (new Date(head.end ?? Date.now()).getTime() -
        new Date(head.start).getTime()) /
        60_000,
    ),
  )
  const date = new Date(head.start).toLocaleString(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const s = head.summary
  // 말한 내용 없이 끝난 회의록 — 빈 칸 3개·AI 고지 대신 안내 1줄(E2E r1)
  const blank = head.status === 'DONE' && emptySummary(s)
  return (
    <article className="space-y-6">
      {/* 대면 노트(세미나 없음)는 내 회의록 목록으로 */}
      <Link
        href={head.smnId ? `/s/${head.smnId}` : '/notes'}
        className="text-muted-foreground text-sm hover:underline"
      >
        ← {t(head.smnId ? 'back' : 'mine')}
      </Link>
      <header className="space-y-1">
        <h1 className="text-xl font-bold">{head.title}</h1>
        <p className="text-muted-foreground text-sm">
          {t('meta', { date, min: String(min) })}
        </p>
        {!blank && (
          <p className="text-muted-foreground text-xs">ⓘ {t('aiWarn')}</p>
        )}
      </header>

      <section
        className="bg-surface space-y-4 rounded-xl p-4 text-sm"
        aria-live="polite"
      >
        {head.status === 'RECORDING' && (
          <div className="space-y-2">
            <p>{t('recording')}</p>
            {/* 발표자 기기 종료 등으로 끄기가 안 온 기록 — 관리 권한자가 직접 끝내고 요약(end 라우트가 RECORDING 을 받는다) */}
            {head.manage && (
              <button
                type="button"
                className={BTN}
                onClick={() => void retry()}
              >
                {t('finish')}
              </button>
            )}
          </div>
        )}
        {head.status === 'SUMMARIZING' && (
          <p>{t(long ? 'makingLong' : 'making')}</p>
        )}
        {head.status === 'FAILED' && (
          <div className="space-y-2">
            <p>{t('failed')}</p>
            {head.manage && (
              <button
                type="button"
                className={BTN}
                onClick={() => void retry()}
              >
                {t('retry')}
              </button>
            )}
          </div>
        )}
        {blank && <p>{t('blank')}</p>}
        {head.status === 'DONE' && s && !blank && (
          <>
            <List title={t('points')} items={s.points} none={t('none')} />
            <List title={t('decisions')} items={s.decisions} none={t('none')} />
            <List title={t('todos')} items={s.todos} none={t('none')} box />
          </>
        )}
      </section>

      <Shots id={id} />
      <Transcript id={id} />

      <button
        type="button"
        className={BTN_PRIMARY}
        onClick={() => void download()}
      >
        {t('download')}
      </button>
      {dlErr && (
        <p role="alert" className="text-sm">
          {t('dlFail')}
        </p>
      )}

      {head.del && (
        <section className="space-y-2 border-t pt-4 text-sm">
          {ask ? (
            <>
              <p role="alert">{t('delAsk')}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={BTN}
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  {t('delYes')}
                </button>
                <button
                  type="button"
                  className={BTN}
                  disabled={busy}
                  onClick={() => setAsk(false)}
                >
                  {t('delNo')}
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className={BTN}
              onClick={() => {
                setDelErr(false)
                setAsk(true)
              }}
            >
              {t('del')}
            </button>
          )}
          {delErr && <p role="alert">{t('delFail')}</p>}
        </section>
      )}
    </article>
  )
}

function List({
  title,
  items,
  none,
  box,
}: {
  title: string
  items: string[]
  none: string
  box?: boolean
}) {
  return (
    <div className="space-y-1">
      <h2 className="font-semibold">{title}</h2>
      {items.length ? (
        <ul className="space-y-1">
          {items.map((x, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden>{box ? '☐' : '•'}</span>
              <span>{x}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">{none}</p>
      )}
    </div>
  )
}

function Shots({ id }: { id: string }) {
  const t = useTranslations('notes')
  const [ref, seen] = useVisible<HTMLElement>()
  const [shots, setShots] = useState<{ at: string; url: string }[] | null>(null)
  const [open, setOpen] = useState<{ at: string; url: string } | null>(null)
  const dlg = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (!seen) return
    void readApi<{ shots: { at: string; url: string }[] }>(
      piFetch(`/api/notes/${id}?part=shots`),
    ).then((r) => setShots(r.ok ? r.data.shots : []))
  }, [seen, id])
  useEffect(() => {
    if (open) dlg.current?.showModal()
  }, [open])
  return (
    <section ref={ref} className="space-y-2">
      <h2 className="font-semibold">
        {t('shots', { n: String(shots?.length ?? 0) })}
      </h2>
      {shots === null ? (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      ) : shots.length ? (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {shots.map((s) => (
            <button
              key={s.url}
              type="button"
              className="shrink-0"
              onClick={() => setOpen(s)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- 서명 URL(1시간)이라 이미지 최적화 캐시를 쓰지 않는다 */}
              <img
                src={s.url}
                alt={t('shotAlt', { at: hhmm(s.at) })}
                loading="lazy"
                className="h-24 w-auto rounded-lg"
              />
            </button>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t('none')}</p>
      )}
      <dialog
        ref={dlg}
        onClose={() => setOpen(null)}
        className="m-auto max-w-[95vw] rounded-xl p-2 backdrop:bg-black/60"
      >
        {open && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- 서명 URL */}
            <img
              src={open.url}
              alt={t('shotAlt', { at: hhmm(open.at) })}
              className="max-h-[80vh] w-auto"
            />
            <form method="dialog" className="mt-2 text-right">
              <button className={BTN}>{t('close')}</button>
            </form>
          </>
        )}
      </dialog>
    </section>
  )
}

function Transcript({ id }: { id: string }) {
  const t = useTranslations('notes')
  const [ref, seen] = useVisible<HTMLElement>()
  const [page, setPage] = useState(1)
  const [d, setD] = useState<{
    segs: { at: string; spk: string; text: string }[]
    total: number
  } | null>(null)
  useEffect(() => {
    if (!seen) return
    let live = true
    void readApi<{
      segs: { at: string; spk: string; text: string }[]
      total: number
    }>(piFetch(`/api/notes/${id}?part=segs&page=${page}`)).then(
      (r) => live && setD(r.ok ? r.data : { segs: [], total: 0 }),
    )
    return () => {
      live = false
    }
  }, [seen, id, page])
  return (
    <section ref={ref} className="space-y-2">
      <h2 className="font-semibold">{t('transcript')}</h2>
      {!d ? (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      ) : d.segs.length ? (
        <ol className="space-y-1 text-sm">
          {d.segs.map((s, i) => (
            <li key={`${s.at}-${i}`} className="flex gap-2">
              <time className="text-muted-foreground shrink-0 tabular-nums">
                {hhmm(s.at)}
              </time>
              <span className="shrink-0 font-medium">{s.spk}</span>
              <span>{s.text}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground text-sm">{t('none')}</p>
      )}
      {d && (
        <Pagination
          page={page}
          pages={Math.ceil(d.total / SEG_PAGE)}
          onPage={setPage}
        />
      )}
    </section>
  )
}
