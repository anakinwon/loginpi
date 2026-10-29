'use client'

// 월 달력 공용(마스터 2026-10-30) — 세미나 만들기 시작일시(date-calendar)·홈 세미나 달력(home-calendar)이 같이 쓴다.
//  달 넘기기 · 날짜 칸에 짧은 제목(2개 + N) · 날짜 상세 창(<dialog>) · 내 Google 일정(비공개 iCal 주소 최대 GCAL_MAX 개, 이 기기에만 저장)
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { readApi } from '@/lib/client-api'
import { NewTab } from '@/components/room/consent'
import { icsLabel, icsUrlOk, type IcsEvent } from '@/lib/ics-read'

export const pad = (n: number) => String(n).padStart(2, '0')
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const monthOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)

// 칸 제목 색 — 캘린더별(주소 목록 순서), 세미나는 강조색
export const CAL_TONE = ['bg-sky-500/30', 'bg-emerald-500/30', 'bg-amber-500/30', 'bg-rose-500/30', 'bg-violet-500/30']
export const SMN_TONE = 'bg-accent/60 text-white'
const CHIPS = 2 // 칸에 보이는 제목 수, 나머지는 +N

export type DayItem = { title: string; tone: string }
export type GcalEvent = IcsEvent & { cal: number }

// ── 내 Google 일정 ── 비공개 iCal 주소는 이 기기에만 둔다(서버 저장 안 함, 서버는 읽어서 돌려주기만). 예전 1개 저장(smn-gcal-url)은 처음 읽을 때 옮긴다
const GCAL_KEY = 'smn-gcal-urls'
const OLD_KEY = 'smn-gcal-url'
const GCAL_MAX = 5
function readUrls(): string[] {
  try {
    const raw = localStorage.getItem(GCAL_KEY)
    if (raw === null) {
      const old = localStorage.getItem(OLD_KEY)
      return old && icsUrlOk(old) ? [old] : []
    }
    const v: unknown = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string' && icsUrlOk(u)).slice(0, GCAL_MAX) : []
  } catch {
    return []
  }
}
function writeUrls(urls: string[]) {
  try {
    localStorage.setItem(GCAL_KEY, JSON.stringify(urls))
    localStorage.removeItem(OLD_KEY)
  } catch {} // 저장 막힌 WebView = 이번 화면에서만 보인다
}

// 종일 일정은 날짜 그대로, 시각 일정은 보는 사람 지역 날짜로
export const gcalDay = (e: IcsEvent) => (e.allDay ? e.start : dayKey(new Date(e.start)))

// 주소×달 결과 캐시(이 탭, 5분) — 달을 오가도 같은 달은 다시 부르지 않는다(R-P2)
const GCAL_TTL_MS = 5 * 60_000
const gcalCache = new Map<string, { at: number; p: ReturnType<typeof fetchMonth> }>()
function fetchMonth(url: string, from: string, to: string) {
  return readApi<{ events: IcsEvent[] }>(
    piFetch('/api/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, from, to }),
    }),
  )
}
function cachedMonth(url: string, from: string, to: string) {
  const k = `${url}|${from}`
  const hit = gcalCache.get(k)
  if (hit && Date.now() - hit.at < GCAL_TTL_MS) return hit.p
  const p = fetchMonth(url, from, to).then((r) => {
    if (!r.ok) gcalCache.delete(k) // 실패는 남기지 않는다(다음에 다시 시도)
    return r
  })
  if (gcalCache.size > 100) gcalCache.clear()
  gcalCache.set(k, { at: Date.now(), p })
  return p
}

// 보이는 달의 내 일정 — 캘린더(주소)끼리 독립이라 병렬(R-P1), 달을 넘길 때마다(주소×달 캐시). on = false 면 부르지 않는다(화면 밖·비로그인)
//  주소는 마운트 뒤에 읽는다 — 서버 렌더(localStorage 없음)와 첫 화면이 같아야 하이드레이션이 어긋나지 않는다
export function useGcal(view: Date, on = true) {
  const [urls, setUrls] = useState<string[]>([])
  const [events, setEvents] = useState<GcalEvent[]>([])
  const [failed, setFailed] = useState(0)
  useEffect(() => setUrls(readUrls()), [])
  useEffect(() => {
    if (!on) return
    if (!urls.length) {
      setEvents([])
      setFailed(0)
      return
    }
    let live = true
    const from = dayKey(view)
    const to = dayKey(new Date(view.getFullYear(), view.getMonth() + 1, 0))
    void Promise.all(urls.map((url) => cachedMonth(url, from, to))).then((rs) => {
      if (!live) return
      setFailed(rs.filter((r) => !r.ok).length)
      setEvents(rs.flatMap((r, cal) => (r.ok ? r.data.events.map((e) => ({ ...e, cal })) : [])).sort((a, b) => a.start.localeCompare(b.start)))
    })
    return () => {
      live = false
    }
  }, [urls, view, on])
  const saveUrls = (next: string[]) => {
    writeUrls(next)
    setUrls(next)
  }
  return { urls, saveUrls, events, failed }
}

// 날짜별로 묶기(이미 시각 순으로 정렬된 입력)
export function groupByDay<T>(list: T[], key: (x: T) => string) {
  const m = new Map<string, T[]>()
  for (const x of list) m.set(key(x), [...(m.get(key(x)) ?? []), x])
  return m
}

// ── 월 격자 ── min·max 밖 달로는 못 넘긴다. off(d) = 고를 수 없는 날(일정이 있으면 상세만 열림), picked = 고른 날(dayKey)
export function MonthGrid({
  view,
  onView,
  min,
  max,
  items,
  picked,
  off,
  onDay,
}: {
  view: Date
  onView: (v: Date) => void
  min: Date
  max: Date
  items: Map<string, DayItem[]>
  picked?: string
  off: (d: Date) => boolean
  onDay: (d: Date, k: string, n: number) => void
}) {
  const locale = useLocale()
  const t = useTranslations('host.gcal')
  const week = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { weekday: 'narrow' })
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(2026, 1, 1 + i))) // 2026-02-01 = 일요일
  }, [locale])
  const title = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(view)
  const todayKey = dayKey(new Date())
  const pickable = picked !== undefined // 홈 달력 = 고르기 없음 → 일정 없는 날은 누를 것이 없다

  // 이번 달 칸 — 앞쪽 빈칸(요일 맞춤) + 날짜
  const cells: (Date | null)[] = Array(view.getDay()).fill(null)
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate()
  for (let i = 1; i <= days; i++) cells.push(new Date(view.getFullYear(), view.getMonth(), i))

  const move = (k: number) => onView(new Date(view.getFullYear(), view.getMonth() + k, 1))
  const canPrev = new Date(view.getFullYear(), view.getMonth(), 0) >= min
  const canNext = new Date(view.getFullYear(), view.getMonth() + 1, 1) <= max

  return (
    <>
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => move(-1)} disabled={!canPrev} aria-label={t('prev')} className="hover:bg-surface-raised h-9 w-9 rounded-full disabled:opacity-30">
          <span aria-hidden>‹</span>
        </button>
        <span className="text-sm font-semibold" aria-live="polite">
          {title}
        </span>
        <button type="button" onClick={() => move(1)} disabled={!canNext} aria-label={t('next')} className="hover:bg-surface-raised h-9 w-9 rounded-full disabled:opacity-30">
          <span aria-hidden>›</span>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm">
        {week.map((w, i) => (
          <span key={i} className={`text-xs ${i === 0 ? 'text-danger' : 'text-muted-foreground'}`}>
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />
          const k = dayKey(d)
          const ev = items.get(k) ?? []
          const isOff = off(d)
          const isPicked = k === picked
          return (
            <button
              key={i}
              type="button"
              disabled={(isOff || !pickable) && !ev.length}
              aria-disabled={isOff || undefined}
              aria-pressed={picked === undefined ? undefined : isPicked}
              aria-label={ev.length ? `${d.toLocaleDateString(locale)} · ${t('count', { n: ev.length })}` : d.toLocaleDateString(locale)}
              onClick={() => onDay(d, k, ev.length)}
              className={`flex min-h-10 min-w-0 flex-col items-stretch gap-0.5 rounded-lg p-0.5 leading-none ${pickable ? 'disabled:opacity-25' : ''} ${isOff ? 'opacity-40' : ''} ${ev.length ? 'min-h-14' : ''} ${
                isPicked ? 'bg-accent font-semibold text-white' : k === todayKey ? 'ring-accent ring-1' : 'hover:bg-surface-raised'
              }`}
            >
              <span className="py-1">{d.getDate()}</span>
              {/* 일정 제목 짧게(마스터 2026-10-30 — 점이 너무 작음), 넘치면 +N */}
              {ev.slice(0, CHIPS).map((e, j) => (
                <span key={j} aria-hidden className={`truncate rounded px-0.5 py-px text-left text-[10px] font-normal ${e.tone}`}>
                  {e.title}
                </span>
              ))}
              {ev.length > CHIPS && (
                <span aria-hidden className="text-left text-[10px] font-normal opacity-70">
                  {t('more', { n: ev.length - CHIPS })}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </>
  )
}

// ── 날짜 상세 창 ── day 가 생기면 열린다. 닫기 = 버튼·Esc·바깥(→ onClose). 바깥 폼 안에 있어도 버튼은 전부 type="button"
export function DayDialog({ day, onClose, children }: { day: string | null; onClose: () => void; children: ReactNode }) {
  const locale = useLocale()
  const t = useTranslations('host.gcal')
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (day && !ref.current?.open) ref.current?.showModal()
  }, [day])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      aria-labelledby="day-dialog-title"
      className="bg-surface m-auto w-[min(28rem,calc(100%-2rem))] rounded-xl p-0 text-current backdrop:bg-black/60"
    >
      <div className="space-y-3 p-4">
        <h3 id="day-dialog-title" className="font-semibold">
          {day && new Date(`${day}T00:00`).toLocaleDateString(locale, { dateStyle: 'full' })}
        </h3>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto text-sm">{children}</div>
        <button type="button" onClick={() => ref.current?.close()} className="bg-accent w-full rounded-full px-3 py-2 text-white">
          {t('close')}
        </button>
      </div>
    </dialog>
  )
}

// 상세 창의 내 Google 일정 목록
export function GcalList({ events, urls }: { events: GcalEvent[]; urls: string[] }) {
  const locale = useLocale()
  const t = useTranslations('host.gcal')
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  if (!events.length) return null
  return (
    <ul className="space-y-2" aria-label={t('day')}>
      {events.map((e, i) => (
        <li key={i} className="bg-surface-raised space-y-1 rounded-lg p-2">
          <p className="flex items-start gap-2">
            <span aria-hidden className={`mt-1 size-2.5 shrink-0 rounded-full ${CAL_TONE[e.cal]}`} />
            <span className="break-words">{e.title}</span>
          </p>
          <p className="text-muted-foreground text-xs">
            {e.allDay ? t('allDay') : e.end ? `${time(e.start)} – ${time(e.end)}` : time(e.start)}
            {e.place && ` · ${e.place}`}
          </p>
          <p className="text-muted-foreground truncate text-xs">{icsLabel(urls[e.cal] ?? '')}</p>
        </li>
      ))}
    </ul>
  )
}

// ── 내 Google 일정 연결 관리 ── 접힌 링크 → 펼치면 순서 안내·설정 바로 가기·주소 목록(삭제)·추가 칸
export function GcalManager({ urls, saveUrls, failed }: { urls: string[]; saveUrls: (u: string[]) => void; failed: number }) {
  const t = useTranslations('host.gcal')
  const tr = useTranslations('room')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [badUrl, setBadUrl] = useState(false)
  const addUrl = () => {
    const u = draft.trim()
    if (!icsUrlOk(u)) return setBadUrl(true)
    setBadUrl(false)
    setDraft('')
    if (!urls.includes(u)) saveUrls([...urls, u].slice(0, GCAL_MAX))
  }
  return (
    <div className="space-y-2 text-xs">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-muted-foreground inline-flex min-h-6 items-center hover:underline">
          📅 {urls.length ? t('change', { n: urls.length }) : t('connect')}
        </button>
      ) : (
        <div className="space-y-2">
          {/* 쉬운 순서 안내 + 설정 화면 바로 가기(마스터 2026-10-28 — 한 문장 설명이 어려웠음) */}
          <ol className="text-muted-foreground list-decimal space-y-0.5 pl-4">
            {(['s1', 's2', 's3', 's4'] as const).map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ol>
          <a href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noopener" className="text-accent inline-block hover:underline">
            {t('open')} <NewTab label={tr('consent.newTab')} />
          </a>
          <p className="text-muted-foreground">🔒 {t('privacy')}</p>
          {urls.length > 0 && (
            <ul className="space-y-1">
              {urls.map((u, i) => (
                <li key={u} className="bg-surface-raised flex items-center gap-2 rounded-lg px-2 py-1">
                  <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${CAL_TONE[i]}`} />
                  <span className="min-w-0 flex-1 truncate">{icsLabel(u)}</span>
                  <button type="button" onClick={() => saveUrls(urls.filter((x) => x !== u))} className="text-danger inline-flex min-h-6 items-center hover:underline">
                    {t('remove')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {urls.length < GCAL_MAX ? (
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault() // 바깥 폼(개설) 제출 막기
                    addUrl()
                  }
                }}
                type="url"
                aria-label={t('add')}
                aria-invalid={badUrl}
                placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
                className="bg-surface-raised min-w-0 flex-1 rounded-lg px-2 py-2"
              />
              <button type="button" onClick={addUrl} className="bg-accent rounded-full px-3 py-1 text-white">
                {t('add')}
              </button>
            </div>
          ) : (
            <p className="text-muted-foreground">{t('full', { n: GCAL_MAX })}</p>
          )}
          {badUrl && <p className="text-danger">{t('badUrl')}</p>}
          <button type="button" onClick={() => setOpen(false)} className="bg-surface-raised rounded-full px-3 py-1">
            {t('close')}
          </button>
        </div>
      )}
      {failed > 0 && <p className="text-danger">{t('failed', { n: failed })}</p>}
    </div>
  )
}
