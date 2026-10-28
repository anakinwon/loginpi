'use client'

// 시작일시 고르기 — 달력이 화면에 펼쳐져 있다(팝업 아님, 마스터 2026-10-28). 날짜를 누르고 아래에서 시·분을 고른다.
//  값은 숨은 input(name) 에 'YYYY-MM-DDTHH:mm'(보는 사람 지역 시간) 으로 — 기존 datetime-local 과 같은 형식이라 폼 제출 코드는 그대로
import { useMemo, useState } from 'react'
import { useLocale } from 'next-intl'
import { START_AHEAD_MAX_MS } from '@/lib/seminar-rules'

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
  const [pick, setPick] = useState(firstPick)
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
              className={`h-9 rounded-lg disabled:opacity-25 ${
                dayKey(d) === dayKey(pick) ? 'bg-accent font-semibold text-white' : dayKey(d) === dayKey(today) ? 'ring-accent ring-1' : 'hover:bg-surface-raised'
              }`}
            >
              {d.getDate()}
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
    </fieldset>
  )
}
