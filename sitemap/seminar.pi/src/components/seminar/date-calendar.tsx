'use client'

// 시작일시 고르기 — 달력이 화면에 펼쳐져 있다(팝업 아님, 마스터 2026-10-28). 날짜를 누르고 아래에서 시·분을 고른다.
//  값은 숨은 input(name) 에 'YYYY-MM-DDTHH:mm'(보는 사람 지역 시간) 으로 — 기존 datetime-local 과 같은 형식이라 폼 제출 코드는 그대로
//  달력·내 Google 일정·상세 창은 공용(month-calendar). 이 화면은 지난 날·1년 뒤를 고를 수 없다(지난 날 일정은 상세만 열림)
import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { START_AHEAD_MAX_MS } from '@/lib/seminar-rules'
import { CAL_TONE, DayDialog, dayKey, GcalList, GcalManager, gcalDay, groupByDay, monthOf, MonthGrid, pad, useGcal } from './month-calendar'

const MINUTES = [0, 10, 20, 30, 40, 50]

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
  const [view, setView] = useState(() => monthOf(pick))
  const [detail, setDetail] = useState<string | null>(null)
  const { urls, saveUrls, events, failed } = useGcal(view)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const last = new Date(Date.now() + START_AHEAD_MAX_MS)
  const off = (d: Date) => d < today || d > last

  const byDay = useMemo(() => groupByDay(events, gcalDay), [events])
  const items = useMemo(() => new Map([...byDay].map(([k, es]) => [k, es.map((e) => ({ title: e.title, tone: CAL_TONE[e.cal] }))])), [byDay])
  const set = (y: number, m: number, d: number, h = pick.getHours(), min = pick.getMinutes()) => setPick(new Date(y, m, d, h, min))

  const value = `${dayKey(pick)}T${pad(pick.getHours())}:${pad(pick.getMinutes())}`
  const sel = 'bg-surface rounded-lg border border-white/10 px-2 py-2'

  return (
    <fieldset className="bg-surface space-y-3 rounded-xl border border-white/10 p-3">
      <legend className="px-1 text-sm">{label}</legend>
      <input type="hidden" name={name} value={value} />
      <MonthGrid
        view={view}
        onView={setView}
        min={today}
        max={last}
        items={items}
        picked={dayKey(pick)}
        off={off}
        onDay={(d, k, n) => {
          if (!off(d)) set(d.getFullYear(), d.getMonth(), d.getDate())
          if (n) setDetail(k)
        }}
      />
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
      {/* 일정 상세 창 — 일정 있는 날을 누르면(고를 수 있는 날이면 시작일로도 골라짐) */}
      <DayDialog day={detail} onClose={() => setDetail(null)}>
        <GcalList events={detail ? (byDay.get(detail) ?? []) : []} urls={urls} />
        {detail && !off(new Date(`${detail}T00:00`)) && <p className="text-muted-foreground text-xs">{t('picked')}</p>}
      </DayDialog>
      <GcalManager urls={urls} saveUrls={saveUrls} failed={failed} />
    </fieldset>
  )
}
