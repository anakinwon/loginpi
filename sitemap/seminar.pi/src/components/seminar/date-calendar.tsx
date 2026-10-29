'use client'

// 시작일시 고르기 — 달력이 화면에 펼쳐져 있다(팝업 아님, 마스터 2026-10-28). 날짜를 누르고 아래에서 시·분을 고른다.
//  값은 숨은 input(name) 에 'YYYY-MM-DDTHH:mm'(보는 사람 지역 시간) 으로 — 기존 datetime-local 과 같은 형식이라 폼 제출 코드는 그대로
//  내 Google 일정(마스터 2026-10-30) : 비공개 iCal 주소 여러 개(최대 GCAL_MAX), 날짜 칸에 짧은 제목, 일정 있는 날을 누르면 상세 창
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { readApi } from '@/lib/client-api'
import { NewTab } from '@/components/room/consent'
import { icsLabel, icsUrlOk, type IcsEvent } from '@/lib/ics-read'
import { START_AHEAD_MAX_MS } from '@/lib/seminar-rules'

// 비공개 iCal 주소는 이 기기에만 둔다(서버 저장 안 함, 서버는 읽어서 돌려주기만). 예전 1개 저장(smn-gcal-url)은 처음 읽을 때 옮긴다
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

// 캘린더별 색(칸 제목·상세 점) — 순서 = 주소 목록 순서
const CAL_TONE = ['bg-sky-500/30', 'bg-emerald-500/30', 'bg-amber-500/30', 'bg-rose-500/30', 'bg-violet-500/30']
type CalEvent = IcsEvent & { cal: number }
const CHIPS = 2 // 칸에 보이는 제목 수, 나머지는 +N

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
  const tr = useTranslations('room')
  const [pick, setPick] = useState(firstPick)
  const [urls, setUrls] = useState(readUrls)
  const [gOpen, setGOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [badUrl, setBadUrl] = useState(false)
  const [events, setEvents] = useState<CalEvent[]>([])
  const [failed, setFailed] = useState(0)
  const [detail, setDetail] = useState<string | null>(null) // 상세 창에 보이는 날짜(dayKey)
  const dlg = useRef<HTMLDialogElement>(null)
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

  // 보이는 달의 내 일정 — 캘린더(주소)끼리 독립이라 병렬(R-P1), 달을 넘길 때마다(서버가 주소별 5분 캐시)
  useEffect(() => {
    if (!urls.length) {
      setEvents([])
      setFailed(0)
      return
    }
    let live = true
    const from = dayKey(view)
    const to = dayKey(new Date(view.getFullYear(), view.getMonth() + 1, 0))
    void Promise.all(
      urls.map((url) =>
        readApi<{ events: IcsEvent[] }>(
          piFetch('/api/calendar/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, from, to }),
          }),
        ),
      ),
    ).then((rs) => {
      if (!live) return
      setFailed(rs.filter((r) => !r.ok).length)
      setEvents(rs.flatMap((r, cal) => (r.ok ? r.data.events.map((e) => ({ ...e, cal })) : [])).sort((a, b) => a.start.localeCompare(b.start)))
    })
    return () => {
      live = false
    }
  }, [urls, view])

  // 종일 일정은 날짜 그대로, 시각 일정은 보는 사람 지역 날짜로
  const evDay = (e: IcsEvent) => (e.allDay ? e.start : dayKey(new Date(e.start)))
  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>()
    for (const e of events) m.set(evDay(e), [...(m.get(evDay(e)) ?? []), e])
    return m
  }, [events])
  const detailEv = detail ? (byDay.get(detail) ?? []) : []

  useEffect(() => {
    if (detail && !dlg.current?.open) dlg.current?.showModal()
  }, [detail])

  const saveUrls = (next: string[]) => {
    writeUrls(next)
    setUrls(next)
  }
  const addUrl = () => {
    const u = draft.trim()
    if (!icsUrlOk(u)) return setBadUrl(true)
    setBadUrl(false)
    setDraft('')
    if (!urls.includes(u)) saveUrls([...urls, u].slice(0, GCAL_MAX))
  }

  const move = (k: number) => setView((v) => new Date(v.getFullYear(), v.getMonth() + k, 1))
  const canPrev = new Date(view.getFullYear(), view.getMonth(), 0) >= today
  const canNext = new Date(view.getFullYear(), view.getMonth() + 1, 1) <= last
  const set = (y: number, m: number, d: number, h = pick.getHours(), min = pick.getMinutes()) => setPick(new Date(y, m, d, h, min))
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })

  const value = `${dayKey(pick)}T${pad(pick.getHours())}:${pad(pick.getMinutes())}`
  const sel = 'bg-surface rounded-lg border border-white/10 px-2 py-2'
  const pill = 'bg-surface-raised rounded-full px-3 py-1'

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
        {cells.map((d, i) => {
          if (!d) return <span key={i} />
          const k = dayKey(d)
          const ev = byDay.get(k) ?? []
          const picked = k === dayKey(pick)
          const off = d < today || d > last // 시작일로 못 고르는 날 — 일정이 있으면 상세만 열린다
          return (
            <button
              key={i}
              type="button"
              disabled={off && !ev.length}
              aria-disabled={off || undefined}
              aria-pressed={picked}
              aria-label={ev.length ? `${d.toLocaleDateString(locale)} · ${t('count', { n: ev.length })}` : d.toLocaleDateString(locale)}
              onClick={() => {
                if (!off) set(d.getFullYear(), d.getMonth(), d.getDate())
                if (ev.length) setDetail(k)
              }}
              className={`flex min-h-10 min-w-0 flex-col items-stretch gap-0.5 rounded-lg p-0.5 leading-none disabled:opacity-25 ${off ? 'opacity-40' : ''} ${ev.length ? 'min-h-14' : ''} ${
                picked ? 'bg-accent font-semibold text-white' : k === dayKey(today) ? 'ring-accent ring-1' : 'hover:bg-surface-raised'
              }`}
            >
              <span className="py-1">{d.getDate()}</span>
              {/* 일정 제목 짧게(마스터 2026-10-30 — 점이 너무 작음), 넘치면 +N */}
              {ev.slice(0, CHIPS).map((e, j) => (
                <span key={j} aria-hidden className={`truncate rounded px-0.5 py-px text-left text-[10px] font-normal ${CAL_TONE[e.cal]}`}>
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

      {/* 일정 상세 창 — 일정 있는 날을 누르면(날짜는 이미 시작일로 골라짐). 닫기 = 버튼·Esc·바깥 */}
      <dialog
        ref={dlg}
        onClose={() => setDetail(null)}
        onClick={(e) => e.target === dlg.current && dlg.current?.close()}
        aria-labelledby="gcal-detail-title"
        className="bg-surface m-auto w-[min(28rem,calc(100%-2rem))] rounded-xl p-0 text-current backdrop:bg-black/60"
      >
        <div className="space-y-3 p-4">
          <h3 id="gcal-detail-title" className="font-semibold">
            {detail && new Date(`${detail}T00:00`).toLocaleDateString(locale, { dateStyle: 'full' })}
          </h3>
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto text-sm" aria-label={t('day')}>
            {detailEv.map((e, i) => (
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
          {detail && detail >= dayKey(today) && detail <= dayKey(last) && <p className="text-muted-foreground text-xs">{t('picked')}</p>}
          <button type="button" onClick={() => dlg.current?.close()} className="bg-accent w-full rounded-full px-3 py-2 text-white">
            {t('close')}
          </button>
        </div>
      </dialog>

      <div className="space-y-2 text-xs">
        {!gOpen ? (
          <button type="button" onClick={() => setGOpen(true)} className="text-muted-foreground inline-flex min-h-6 items-center hover:underline">
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
            <button type="button" onClick={() => setGOpen(false)} className={pill}>
              {t('close')}
            </button>
          </div>
        )}
        {failed > 0 && <p className="text-danger">{t('failed', { n: failed })}</p>}
      </div>
    </fieldset>
  )
}
