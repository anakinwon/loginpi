'use client'

// 홈 세미나 달력(마스터 2026-10-30) — 그 달 세미나(예정·진행 중·지난 이력) + 내 Google 일정(로그인하고 이 기기에 연결했을 때).
//  만들기 화면과 달리 지난 달로도 넘긴다(과거 이력, CAL_BACK_MONTHS 전까지). 일정 있는 날을 누르면 상세 창 — 세미나는 상세 화면 바로 가기.
//  홈은 빌드 때 정적으로 미리 만들어진다 → '오늘'·보는 달·저장 주소에 따라 달라지는 달력은 화면에 들어온 뒤(seen)에만 그린다
//  (서버 HTML 에 빌드 날짜가 박혀 하이드레이션이 어긋나지 않게). 조회도 그때부터(데이터 패칭 표준 ③), 달을 넘길 때마다 비동기(②)
import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { useAppUser } from '@/components/google-auth'
import { useVisible } from '@/components/notes/note-view'
import { Link } from '@/i18n/navigation'
import { readApi } from '@/lib/client-api'
import { CAL_AHEAD_MONTHS, CAL_BACK_MONTHS, smnPast } from '@/lib/seminar-rules'
import { CAL_TONE, DayDialog, dayKey, GcalList, GcalManager, gcalDay, groupByDay, monthOf, MonthGrid, SMN_TONE, useGcal, type DayItem } from './month-calendar'

type SmnDay = { id: string; title: string; startAt: string; status: 'SCHEDULED' | 'LIVE' | 'ENDED' }
const PAST_TONE = 'bg-surface-raised text-muted-foreground line-through'

// 달별 세미나 캐시(이 탭, 60초 — 서버 공개 캐시와 같은 길이) — 달을 오가도 같은 달은 다시 부르지 않는다(R-P2)
const SMN_TTL_MS = 60_000
const smnCache = new Map<string, { at: number; p: Promise<SmnDay[] | null> }>()
function monthSeminars(from: string, to: string) {
  const hit = smnCache.get(from)
  if (hit && Date.now() - hit.at < SMN_TTL_MS) return hit.p
  const p = readApi<{ rows: SmnDay[] }>(piFetch(`/api/seminars/month?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)).then((r) => {
    if (!r.ok) smnCache.delete(from)
    return r.ok ? r.data.rows : null
  })
  smnCache.set(from, { at: Date.now(), p })
  return p
}

export function HomeCalendar() {
  const t = useTranslations('home.cal')
  const tl = useTranslations('list')
  const locale = useLocale()
  const { user } = useAppUser()
  const [ref, seen] = useVisible<HTMLElement>()
  const [view, setView] = useState(() => monthOf(new Date()))
  const [smn, setSmn] = useState<SmnDay[]>([])
  const [smnErr, setSmnErr] = useState(false)
  const [detail, setDetail] = useState<string | null>(null)
  // 내 Google 일정은 로그인 사용자만 — 조회 API 가 로그인 필수라 비로그인은 매번 401('주소 확인' 오류로 잘못 보임)
  const mine = seen && !!user
  const { urls, saveUrls, events, failed } = useGcal(view, mine)

  // 그 달 세미나 — 보는 사람 지역 달의 처음~다음 달 처음
  useEffect(() => {
    if (!seen) return
    let live = true
    const from = view.toISOString()
    const to = new Date(view.getFullYear(), view.getMonth() + 1, 1).toISOString()
    void monthSeminars(from, to).then((rows) => {
      if (!live) return
      setSmnErr(!rows)
      setSmn(rows ?? [])
    })
    return () => {
      live = false
    }
  }, [view, seen])

  const smnBy = useMemo(() => groupByDay(smn, (s) => dayKey(new Date(s.startAt))), [smn])
  const gcalBy = useMemo(() => groupByDay(mine ? events : [], gcalDay), [events, mine])
  // 칸 제목 — 세미나 먼저(다가올 = 강조색, 지난 = 흐린 취소선), 그다음 내 일정(캘린더별 색)
  const items = useMemo(() => {
    const m = new Map<string, DayItem[]>()
    for (const [k, ss] of smnBy) m.set(k, ss.map((s) => ({ title: s.title, tone: smnPast(s.status, s.startAt) ? PAST_TONE : SMN_TONE })))
    for (const [k, es] of gcalBy) m.set(k, [...(m.get(k) ?? []), ...es.map((e) => ({ title: e.title, tone: CAL_TONE[e.cal] }))])
    return m
  }, [smnBy, gcalBy])

  const now = new Date()
  const min = new Date(now.getFullYear(), now.getMonth() - CAL_BACK_MONTHS, 1)
  const max = new Date(now.getFullYear(), now.getMonth() + CAL_AHEAD_MONTHS + 1, 0)
  const daySmn = detail ? (smnBy.get(detail) ?? []) : []
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })

  return (
    <section ref={ref} aria-labelledby="home-cal-title" className="bg-surface/80 relative space-y-3 overflow-hidden rounded-2xl border border-white/10 p-3 sm:p-4">
      <div aria-hidden className="bg-accent/20 pointer-events-none absolute -top-24 -right-16 size-56 rounded-full blur-3xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="home-cal-title" className="text-lg font-bold">
            <span aria-hidden>🗓️ </span>
            {t('title')}
          </h2>
          <p className="text-muted-foreground text-xs break-keep">{t('desc')}</p>
        </div>
        <p className="text-muted-foreground flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span aria-hidden className={`size-2.5 rounded-full ${SMN_TONE}`} />
            {t('legendSmn')}
          </span>
          <span className="flex items-center gap-1">
            <span aria-hidden className="bg-surface-raised size-2.5 rounded-full border border-white/40" />
            {t('legendEnded')}
          </span>
          {mine && urls.length > 0 && (
            <span className="flex items-center gap-1">
              <span aria-hidden className={`size-2.5 rounded-full ${CAL_TONE[0]}`} />
              {t('legendMine')}
            </span>
          )}
        </p>
      </div>
      <div className="relative space-y-3">
        {seen ? (
          <MonthGrid view={view} onView={setView} min={min} max={max} items={items} off={() => false} onDay={(_, k, n) => n && setDetail(k)} large />
        ) : (
          // 자리 표시 — 서버 HTML·첫 화면(달력이 들어갈 높이만)
          <div aria-hidden className="h-[28rem]" />
        )}
        {smnErr && <p className="text-danger text-xs">{t('failed')}</p>}
        {mine && <GcalManager urls={urls} saveUrls={saveUrls} failed={failed} />}
      </div>
      <DayDialog day={detail} onClose={() => setDetail(null)}>
        {daySmn.length > 0 && (
          <ul className="space-y-2" aria-label={t('legendSmn')}>
            {daySmn.map((s) => {
              const past = smnPast(s.status, s.startAt)
              return (
                <li key={s.id}>
                  <Link href={`/s/${s.id}`} className="bg-surface-raised hover:ring-accent block space-y-1 rounded-lg p-2 hover:ring-1">
                    <p className="flex items-start justify-between gap-2">
                      <span className="font-semibold break-words">{s.title}</span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${past ? 'bg-surface text-muted-foreground' : s.status === 'LIVE' ? 'bg-danger text-white' : 'bg-accent text-white'}`}
                      >
                        {past ? t('legendEnded') : tl(`status.${s.status}`)}
                      </span>
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {time(s.startAt)} · {t('open')}
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
        <GcalList events={detail ? (gcalBy.get(detail) ?? []) : []} urls={urls} />
      </DayDialog>
    </section>
  )
}
