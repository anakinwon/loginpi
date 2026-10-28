'use client'

// 시작일시 고르기 — 달력이 화면에 펼쳐져 있다(팝업 아님, 마스터 2026-10-28). 날짜를 누르고 아래에서 시·분을 고른다.
//  값은 숨은 input(name) 에 'YYYY-MM-DDTHH:mm'(보는 사람 지역 시간) 으로 — 기존 datetime-local 과 같은 형식이라 폼 제출 코드는 그대로
import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { readApi } from '@/lib/client-api'
import type { IcsEvent } from '@/lib/ics-read'
import { START_AHEAD_MAX_MS } from '@/lib/seminar-rules'

// 내 Google 일정 — 비공개 iCal 주소는 이 기기에만 둔다(서버 저장 안 함, 서버는 읽어서 돌려주기만)
const GCAL_KEY = 'smn-gcal-url'
const readUrl = () => {
  try {
    return localStorage.getItem(GCAL_KEY) ?? ''
  } catch {
    return ''
  }
}

const MINUTES = [0, 10, 20, 30, 40, 50]
const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// 처음 값 — 다음 정각(23시 넘으면 다음 날 같은 방식)
function firstPick() {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return d
}

export function DateCalendar({ name, label }: { name: string; label: string }) {
  const locale = useLocale()
  const t = useTranslations('host.gcal')
  const [pick, setPick] = useState(firstPick)
  const [gUrl, setGUrl] = useState(readUrl)
  const [gOpen, setGOpen] = useState(false)
  const [events, setEvents] = useState<IcsEvent[]>([])
  const [gErr, setGErr] = useState(false)
  const [view, setView] = useState(() => new Date(pick.getFullYear(), pick.getMonth(), 1))
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const last = new Date(Date.now() + START_AHEAD_MAX_MS)

  const week = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { weekday: 'narrow' })
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(2026, 1, 1 + i))) // 2026-02-01 = 일요일
  }, [locale])
  const title = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(view)

  // 이번 달 칸 — 앞쪽 빈칸(요일 맞춤) + 날짜
  const cells: (Date | null)[] = Array(view.getDay()).fill(null)
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate()
  for (let i = 1; i <= days; i++) cells.push(new Date(view.getFullYear(), view.getMonth(), i))

  // 보이는 달의 내 일정 — 주소가 있을 때만, 달을 넘길 때마다(서버가 5분 캐시)
  useEffect(() => {
    if (!gUrl) return setEvents([])
    let live = true
    const from = dayKey(view)
    const to = dayKey(new Date(view.getFullYear(), view.getMonth() + 1, 0))
    void readApi<{ events: IcsEvent[] }>(
      piFetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: gUrl, from, to }),
      }),
    ).then((r) => {
      if (!live) return
      setGErr(!r.ok)
      setEvents(r.ok ? r.data.events : [])
    })
    return () => {
      live = false
    }
  }, [gUrl, view])
  // 종일 일정은 날짜 그대로, 시각 일정은 보는 사람 지역 날짜로
  const evDay = (e: IcsEvent) => (e.allDay ? e.start : dayKey(new Date(e.start)))
  const has = new Set(events.map(evDay))
  const todays = events.filter((e) => evDay(e) === dayKey(pick))
  const saveUrl = (u: string) => {
    try {
      if (u) localStorage.setItem(GCAL_KEY, u)
      else localStorage.removeItem(GCAL_KEY)
    } catch {}
    setGUrl(u)
    setGOpen(false)
  }

  const move = (k: number) => setView((v) => new Date(v.getFullYear(), v.getMonth() + k, 1))
  const canPrev = new Date(view.getFullYear(), view.getMonth(), 0) >= today
  const canNext = new Date(view.getFullYear(), view.getMonth() + 1, 1) <= last
  const set = (y: number, m: number, d: number, h = pick.getHours(), min = pick.getMinutes()) => setPick(new Date(y, m, d, h, min))

  const value = `${dayKey(pick)}T${pad(pick.getHours())}:${pad(pick.getMinutes())}`
  const sel = 'bg-surface rounded-lg border border-white/10 px-2 py-2'

  return (
    <fieldset className="bg-surface space-y-3 rounded-xl border border-white/10 p-3">
      <legend className="px-1 text-sm">{label}</legend>
      <input type="hidden" name={name} value={value} />
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => move(-1)} disabled={!canPrev} aria-label="‹" className="h-9 w-9 rounded-full disabled:opacity-30">
          ‹
        </button>
        <span className="text-sm font-semibold" aria-live="polite">
          {title}
        </span>
        <button type="button" onClick={() => move(1)} disabled={!canNext} aria-label="›" className="h-9 w-9 rounded-full disabled:opacity-30">
          ›
        </button>
      </div>
      <div role="grid" className="grid grid-cols-7 gap-1 text-center text-sm">
        {week.map((w, i) => (
          <span key={i} className={`text-xs ${i === 0 ? 'text-danger' : 'text-muted-foreground'}`}>
            {w}
          </span>
        ))}
        {cells.map((d, i) =>
          d ? (
            <button
              key={i}
              type="button"
              disabled={d < today || d > last}
              aria-pressed={dayKey(d) === dayKey(pick)}
              aria-label={d.toLocaleDateString(locale)}
              onClick={() => set(d.getFullYear(), d.getMonth(), d.getDate())}
              className={`h-10 rounded-lg leading-none disabled:opacity-25 ${
                dayKey(d) === dayKey(pick) ? 'bg-accent font-semibold text-white' : dayKey(d) === dayKey(today) ? 'ring-accent ring-1' : 'hover:bg-surface-raised'
              }`}
            >
              {d.getDate()}
              {has.has(dayKey(d)) && <span aria-hidden className="bg-accent mx-auto mt-0.5 block size-1 rounded-full" />}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <select
          aria-label="hour"
          value={pick.getHours()}
          onChange={(e) => set(pick.getFullYear(), pick.getMonth(), pick.getDate(), +e.target.value)}
          className={sel}
        >
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {pad(h)}
            </option>
          ))}
        </select>
        <span>:</span>
        <select
          aria-label="minute"
          value={pick.getMinutes()}
          onChange={(e) => set(pick.getFullYear(), pick.getMonth(), pick.getDate(), pick.getHours(), +e.target.value)}
          className={sel}
        >
          {MINUTES.map((m) => (
            <option key={m} value={m}>
              {pad(m)}
            </option>
          ))}
        </select>
        <span className="text-muted-foreground ml-auto">
          {pick.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}
        </span>
      </div>
      {/* 고른 날의 내 Google 일정 */}
      {todays.length > 0 && (
        <ul className="space-y-1 text-xs" aria-label={t('day')}>
          {todays.map((e, i) => (
            <li key={i} className="bg-surface-raised flex gap-2 rounded px-2 py-1">
              <span className="text-muted-foreground shrink-0">
                {e.allDay ? t('allDay') : new Date(e.start).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="truncate">{e.title}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="text-xs">
        {!gOpen ? (
          <button type="button" onClick={() => setGOpen(true)} className="text-muted-foreground hover:underline">
            📅 {gUrl ? t('change') : t('connect')}
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-muted-foreground">{t('help')}</p>
            <input
              defaultValue={gUrl}
              id="gcal-url"
              type="url"
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              className="bg-surface-raised w-full rounded-lg px-2 py-2"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => saveUrl((document.getElementById('gcal-url') as HTMLInputElement).value.trim())}
                className="bg-accent rounded-full px-3 py-1 text-white"
              >
                {t('save')}
              </button>
              {gUrl && (
                <button type="button" onClick={() => saveUrl('')} className="bg-surface-raised rounded-full px-3 py-1">
                  {t('remove')}
                </button>
              )}
              <button type="button" onClick={() => setGOpen(false)} className="bg-surface-raised rounded-full px-3 py-1">
                {t('cancel')}
              </button>
            </div>
          </div>
        )}
        {gErr && gUrl && <p className="text-danger mt-1">{t('failed')}</p>}
      </div>
    </fieldset>
  )
}
