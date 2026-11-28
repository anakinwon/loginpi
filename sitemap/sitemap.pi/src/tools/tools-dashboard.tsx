'use client'

// PC 도구 현황 대시보드(/admin/tools) — 클라이언트 게이트(LoginGate, redirect 없음) + piFetch(/api/admin/tools, 관리자만 200 — 401/403 은 오류 문구)
//  상단(KPI·상태) = view=summary 60초 polling(탭이 숨겨지면 멈추고 다시 보이면 즉시 1회)
//  하단(그래프·표) = LazySection 으로 뷰포트 진입 직전에만 view=charts·rows 조회, 새 측정(msrmt_dtm)이 오면 다시 조회, 실패한 구획은 다음 polling·새로고침(tick) 때 재조회
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useFormatter, useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { LazySection } from '@/components/lazy-section'
import { LoginGate } from '@/components/login-gate'
import { Link } from '@/i18n/navigation'
import { readApi, useApiErrorText, type ApiErrorBody } from '@/lib/client-api'
import { ToolsTable } from './tools-table'
import { useSection } from './use-section'
import {
  INST_CNT,
  KIND_COLOR,
  POLL_MS,
  TOOL_KINDS,
  TOP_N,
  USE_CNT,
  type ChartsResp,
  type SnapKey,
  type SummaryResp,
  type ToolKind,
} from './types'

const ToolCharts = dynamic(() => import('./tool-charts').then((m) => m.ToolCharts), {
  ssr: false,
  loading: () => <div className="tool-panel h-72 animate-pulse" />,
})

// 업로더 생존 판정 — (현재 시각 − 마지막 측정일시) 가 주기의 2.5배를 넘으면 응답 없음. 현재 시각은 30초마다 갱신(조회 실패가 이어져도 판정이 멈추지 않게)
const STALE_FACTOR = 2.5
const EVERY_DFLT_SEC = 300
const CLOCK_MS = 30_000

function useSummary() {
  const [data, setData] = useState<SummaryResp | null>(null)
  const [err, setErr] = useState<ApiErrorBody | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0) // 조회 시도마다 +1 — 하단 실패 구획 재조회 신호
  const ctrl = useRef<AbortController | null>(null)
  // 요청 겹침 방지(c4 D-010) — 새 요청이 직전 요청을 취소하고, 취소됐거나 뒤에 새 요청이 시작된 응답은 버린다.
  //  같은 PC 의 응답인데 최신 측정일시가 보관값보다 오래되면(늦게 도착한 이전 응답) 무시
  const load = useCallback(async () => {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    const r = await readApi<SummaryResp>(piFetch('/api/admin/tools?view=summary', { cache: 'no-store', signal: c.signal }))
    if (c.signal.aborted || ctrl.current !== c) return
    if (r.ok) {
      setData((prev) => {
        const a = prev?.latest
        const b = r.data.latest
        return a && b && a.pc_nm === b.pc_nm && Date.parse(b.msrmt_dtm) < Date.parse(a.msrmt_dtm) ? prev : r.data
      })
      setErr(null)
    } else setErr(r.body)
    setLoading(false)
    setTick((n) => n + 1)
  }, [])
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    const start = () => {
      clearInterval(timer)
      timer = setInterval(() => void load(), POLL_MS)
    }
    const onVis = () => {
      if (document.hidden) clearInterval(timer)
      else {
        void load()
        start()
      }
    }
    void load()
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
      ctrl.current?.abort()
    }
  }, [load])
  return { data, err, loading, tick, reload: load }
}

function useClock() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_MS)
    return () => clearInterval(id)
  }, [])
  return now
}

export function ToolsDashboard() {
  return <LoginGate>{() => <Dashboard />}</LoginGate>
}

function Dashboard() {
  const t = useTranslations('tools')
  const f = useFormatter()
  const errText = useApiErrorText()
  const { data, err, loading, tick, reload } = useSummary()
  const now = useClock()
  const latest = data?.latest ?? null
  const snap = data?.snap ?? null // 하단 구획 조회 고정값(같은 측정)

  const view = useMemo(() => {
    if (!latest || !data) return null
    const first = data.trend.length > 1 ? data.trend[0] : null
    const spanMin = first ? Math.round((Date.parse(latest.msrmt_dtm) - Date.parse(first.msrmt_dtm)) / 60_000) : 0
    return {
      installed: Object.fromEntries(TOOL_KINDS.map((k) => [k, latest[INST_CNT[k]]])) as Record<ToolKind, number>,
      used: Object.fromEntries(TOOL_KINDS.map((k) => [k, latest[USE_CNT[k]]])) as Record<ToolKind, number>,
      active: data.meta?.active ?? null,
      delta: Object.fromEntries(TOOL_KINDS.map((k) => [k, first ? latest[INST_CNT[k]] - first[INST_CNT[k]] : 0])) as Record<ToolKind, number>,
      spanMin,
      every: data.meta?.every_sec ?? EVERY_DFLT_SEC,
    }
  }, [latest, data])

  const kindLabel = useCallback((k: ToolKind) => t(`kind.${k}`), [t])
  const ageMs = latest ? now - Date.parse(latest.msrmt_dtm) : null
  const stale = view != null && !(ageMs != null && ageMs <= view.every * 1000 * STALE_FACTOR)
  const spanLabel = view
    ? view.spanMin >= 60
      ? t('deltaHours', { n: Math.round(view.spanMin / 60) })
      : t('deltaMinutes', { n: view.spanMin })
    : ''

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/admin" className="text-muted-foreground text-xs hover:underline">
            ← {t('back')}
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
        <button type="button" className="btn self-start sm:self-auto" onClick={() => void reload()}>
          {t('refresh')}
        </button>
      </header>

      {loading && !data && <div className="tool-panel h-40 animate-pulse" aria-busy="true" aria-label={t('loading')} />}
      {err && (
        <div className="tool-panel flex flex-wrap items-center justify-between gap-2" role="alert">
          <p className="text-destructive text-sm">
            {t('fetchFailed')} · {errText(err)}
          </p>
          <button type="button" className="btn" onClick={() => void reload()}>
            {t('retry')}
          </button>
        </div>
      )}
      {data && !latest && !err && (
        <div className="tool-panel text-sm">
          <p className="font-medium">{t('noData')}</p>
          <p className="text-muted-foreground mt-1 font-mono text-xs">node scripts/tool-snap-push.mjs --every 300</p>
        </div>
      )}

      {latest && snap && view && (
        <>
          <section className="tool-status">
            <div className="flex items-center gap-2">
              <span className={err || stale ? 'tool-live tool-live-off' : 'tool-live'} aria-hidden />
              <span className="text-sm font-medium">
                {err ? t('statusUnknown') : stale ? t('uploaderStale') : t('uploaderOk')}
              </span>
            </div>
            <dl className="tool-status-meta">
              <div>
                <dt>{t('lastMsrmt')}</dt>
                <dd>
                  {f.dateTime(new Date(latest.msrmt_dtm), { dateStyle: 'short', timeStyle: 'short' })}
                  <span className="text-muted-foreground"> · {f.relativeTime(new Date(latest.msrmt_dtm), new Date(now))}</span>
                </dd>
              </div>
              <div>
                <dt>{t('pc')}</dt>
                <dd className="font-mono">{latest.pc_nm}</dd>
              </div>
              <div>
                <dt>{t('cycle')}</dt>
                <dd>{t('cycleSec', { sec: view.every })}</dd>
              </div>
            </dl>
          </section>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {TOOL_KINDS.map((k) => (
              <article key={k} className="tool-kpi" style={{ borderTopColor: KIND_COLOR[k] }}>
                <h2 className="tool-kpi-label">{t(`kind.${k}`)}</h2>
                <p className="tool-kpi-value">{f.number(view.installed[k])}</p>
                <p className="tool-kpi-sub">
                  {t('installed')}
                  {view.delta[k] !== 0 && (
                    <span className={view.delta[k] > 0 ? 'text-emerald-400' : 'text-destructive'}>
                      {' '}
                      {view.delta[k] > 0 ? '+' : ''}
                      {view.delta[k]} {spanLabel}
                    </span>
                  )}
                </p>
                <dl className="tool-kpi-grid">
                  <div>
                    <dt>{t('active')}</dt>
                    <dd>{view.active?.[k] != null ? f.number(view.active[k]) : '–'}</dd>
                  </div>
                  <div>
                    <dt>{k === 'hook' ? t('usedEvents') : t('used')}</dt>
                    <dd>{f.number(view.used[k])}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </section>

          <LazySection fallback={<div className="tool-panel h-72 animate-pulse" />}>
            <ChartsBlock snap={snap} tick={tick} installed={view.installed} kindLabel={kindLabel} />
          </LazySection>

          <LazySection fallback={<div className="tool-panel h-96 animate-pulse" />}>
            <ToolsTable snap={snap} tick={tick} />
          </LazySection>
        </>
      )}
    </div>
  )
}

// 그래프 구획 — 마운트(뷰포트 진입)·새 측정 때 view=charts 조회, 실패하면 다음 polling·새로고침 때 재시도. 오류는 이전 그래프 위에 항상 표시
function ChartsBlock({
  snap,
  tick,
  installed,
  kindLabel,
}: {
  snap: SnapKey
  tick: number
  installed: Record<ToolKind, number>
  kindLabel: (k: ToolKind) => string
}) {
  const t = useTranslations('tools')
  const errText = useApiErrorText()
  const { data, err } = useSection<ChartsResp>(`/api/admin/tools?${new URLSearchParams({ view: 'charts', pc: snap.pc, at: snap.at, ih: snap.ih ?? '', uh: snap.uh ?? '' })}`, snap.at, tick)

  const banner = err && (
    <div className="tool-panel text-destructive text-sm" role="alert">
      {t('fetchFailed')} · {errText(err)}
    </div>
  )
  if (!data)
    return (
      <div className="flex flex-col gap-2">
        {banner}
        {!err && <div className="tool-panel h-72 animate-pulse" />}
      </div>
    )
  // 최신 측정과 같은 내용의 사용 상세가 없음 — 다른 측정의 그래프는 그리지 않는다
  if (data.missing)
    return (
      <div className="flex flex-col gap-2">
        {banner}
        <p className="tool-panel text-muted-foreground text-sm">{t('detailMissing')}</p>
      </div>
    )
  return (
    <div className="flex flex-col gap-2">
      {banner}
      <p className="text-muted-foreground text-xs">
        {t('period')} {data.from && data.to ? `${data.from} ~ ${data.to}` : '–'} · {t('turns', { n: data.turns })}
      </p>
      <ToolCharts
        installed={installed}
        top={data.top}
        daily={data.daily}
        hooks={data.hooks}
        kindLabel={kindLabel}
        titles={{
          installed: t('chartInstalled'),
          top: t('chartTop', { n: TOP_N }),
          daily: t('chartDaily'),
          hooks: t('chartHooks'),
        }}
        emptyText={t('chartEmpty')}
      />
    </div>
  )
}
