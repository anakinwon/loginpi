'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { piFetch } from '@/lib/pi-fetch'
import { readCache, writeCache } from '@/lib/client-cache'
import { LazySection } from '@/components/lazy-section'
import { StatsCard } from '@/components/admin/stats/stats-card'

const FunnelChart = dynamic(() => import('@/components/charts/funnel-chart'), {
  ssr: false,
})
const PageviewTrendChart = dynamic(
  () => import('@/components/charts/pageview-trend-chart'),
  { ssr: false },
)

interface PvResponse {
  period: number
  summary: {
    totalPv: number
    sessions: number
    pvPerSession: number
    avgDwellSec: number
    bounceRate: number
  }
  pvTrend: { date: string; cnt: number }[]
  channels: { cd: string; label: string; cnt: number }[]
  topLanding: { path: string; cnt: number }[]
  topExit: { path: string; cnt: number }[]
}

interface PerfResponse {
  period: number
  funnel: {
    key: string
    label: string
    cnt: number
    pctOfTop: number
    convFromPrev: number
  }[]
  conversion: {
    signupToActive: number
    activeToBuyer: number
    buyerToRepeat: number
  }
  activityTypes: { cd: string; label: string; cnt: number }[]
  engagementDepth: { code: string; label: string; cnt: number }[]
  activeUsersPeriod: number
  sessionTrackingPending: boolean
}

const TYPE_COLORS = [
  'bg-[var(--kpi-1)]',
  'bg-[var(--kpi-3)]',
  'bg-[var(--kpi-5)]',
  'bg-[var(--kpi-2)]',
  'bg-[var(--kpi-4)]',
]

// 퍼포먼스 분석 탭 (Phase 22 §12 ④) — 라이프사이클 퍼널·전환율·활동구성·참여깊이.
//   PI 모드: 구매자 전환율 = Pi 결제 완료 기준 (mps_order 소스 동일).
export function PerformanceTab({ period }: { period: number }) {
  const t = useTranslations('adminAnalytics')
  const tc = useTranslations('common')
  const [data, setData] = useState<PerfResponse | null>(null)
  const [pv, setPv] = useState<PvResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchPerf = useCallback(async (p: number) => {
    setError(null)
    const cacheKey = `analytics_perf_${p}`
    const cached = readCache<PerfResponse>(cacheKey, 5 * 60_000)
    if (cached) setData(cached)
    try {
      const res = await piFetch(`/api/admin/analytics/performance?period=${p}`)
      if (!res.ok) throw new Error('퍼포먼스 분석 조회 실패')
      const json = (await res.json()) as PerfResponse
      setData(json)
      writeCache(cacheKey, json)
    } catch (e) {
      if (!cached) setError(e instanceof Error ? e.message : tc('error'))
    }
  }, [])

  // 웹 트래픽(페이지뷰) — 별도 조회. 실패해도 본 탭은 유지(수집 초기엔 빈 데이터).
  const fetchPv = useCallback(async (p: number) => {
    const cacheKey = `analytics_pv_${p}`
    const cached = readCache<PvResponse>(cacheKey, 5 * 60_000)
    if (cached) setPv(cached)
    try {
      const res = await piFetch(`/api/admin/analytics/pageviews?period=${p}`)
      if (!res.ok) return
      const json = (await res.json()) as PvResponse
      setPv(json)
      writeCache(cacheKey, json)
    } catch {
      // 무시
    }
  }, [])

  useEffect(() => {
    fetchPerf(period)
    fetchPv(period)
  }, [period, fetchPerf, fetchPv])

  if (error)
    return (
      <div className="border-destructive/30 bg-destructive/5 rounded-lg border p-6 text-center">
        <p className="text-destructive text-sm">{error}</p>
        <button
          onClick={() => fetchPerf(period)}
          className="text-muted-foreground mt-2 text-sm underline"
        >
          {t('common.retry')}
        </button>
      </div>
    )

  const c = data?.conversion
  const loading = data === null
  const typeTotal =
    (data?.activityTypes ?? []).reduce((a, b) => a + b.cnt, 0) || 1
  const depthMax = Math.max(
    1,
    ...(data?.engagementDepth ?? []).map((d) => d.cnt),
  )

  return (
    <div className="space-y-5">
      {/* Zone 1 — 전환율 KPI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatsCard
          label={t('perf.convSignupActive')}
          value={Number((c?.signupToActive ?? 0).toFixed(1))}
          unit="%"
          loading={loading}
          variant="kpi-1"
          icon={<span aria-hidden>🔓</span>}
        />
        <StatsCard
          label={t('perf.convActiveBuyer')}
          value={Number((c?.activeToBuyer ?? 0).toFixed(1))}
          unit="%"
          loading={loading}
          variant="kpi-3"
          icon={<span aria-hidden>🛒</span>}
        />
        <StatsCard
          label={t('perf.convBuyerRepeat')}
          value={Number((c?.buyerToRepeat ?? 0).toFixed(1))}
          unit="%"
          loading={loading}
          variant="kpi-2"
          icon={<span aria-hidden>🔁</span>}
        />
      </div>

      {/* Zone 2 — 라이프사이클 전환 퍼널 */}
      <div className="rounded-lg border p-4">
        <p className="mb-3 text-sm font-medium">
          {t('perf.funnelTitle')}{' '}
          <span className="text-muted-foreground text-xs">
            {t('perf.funnelUnit')}
          </span>
        </p>
        <LazySection>
          {data ? (
            <FunnelChart stages={data.funnel} />
          ) : (
            <div className="bg-muted h-56 animate-pulse rounded-lg" />
          )}
        </LazySection>
      </div>

      {/* Zone 3 — 활동 유형 분포 + 참여 깊이 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="mb-3 text-sm font-medium">
            {t('perf.activityType')}{' '}
            <span className="text-muted-foreground text-xs">
              {t('common.recentDays', { period })}
            </span>
          </p>
          {loading ? (
            <div className="bg-muted h-24 animate-pulse rounded-lg" />
          ) : data && data.activityTypes.length > 0 ? (
            <div className="space-y-2">
              {data.activityTypes.map((at, i) => {
                const pct = (at.cnt / typeTotal) * 100
                return (
                  <div key={at.cd} className="text-sm">
                    <div className="mb-1 flex justify-between">
                      <span>{t(`perf.actvty.${at.cd}`)}</span>
                      <span className="text-muted-foreground">
                        {at.cnt}
                        {t('common.uCase')} · {pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="bg-muted h-2.5 overflow-hidden rounded-full">
                      <div
                        className={`h-full rounded-full ${TYPE_COLORS[i % TYPE_COLORS.length]}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {t('charts.nrEmpty')}
            </p>
          )}
        </div>

        <div className="rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">{t('perf.depth')}</p>
            {data && (
              <span className="text-muted-foreground text-xs">
                {t('perf.activeUsers', { n: data.activeUsersPeriod })}
              </span>
            )}
          </div>
          {loading ? (
            <div className="bg-muted h-24 animate-pulse rounded-lg" />
          ) : (
            <div className="space-y-2">
              {(data?.engagementDepth ?? []).map((d) => {
                const pct = (d.cnt / depthMax) * 100
                return (
                  <div key={d.code} className="text-sm">
                    <div className="mb-1 flex justify-between">
                      <span>{t(`perf.depthBucket.${d.code}`)}</span>
                      <span className="text-muted-foreground">
                        {d.cnt}
                        {t('common.uPerson')}
                      </span>
                    </div>
                    <div className="bg-muted h-2.5 overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full bg-[var(--kpi-4)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── 웹 트래픽 (페이지뷰 추적층) ───────────────────────── */}
      <div className="border-t pt-5">
        <p className="mb-3 text-sm font-semibold">{t('perf.webTraffic')}</p>

        {/* 트래픽 KPI */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatsCard
            label={t('perf.kpiPv')}
            value={pv?.summary.totalPv ?? 0}
            unit={t('common.uPv')}
            loading={pv === null}
            variant="kpi-1"
            icon={<span aria-hidden>👁️</span>}
          />
          <StatsCard
            label={t('perf.kpiSessions')}
            value={pv?.summary.sessions ?? 0}
            unit={t('common.uCount')}
            loading={pv === null}
            variant="kpi-3"
            icon={<span aria-hidden>🧩</span>}
          />
          <StatsCard
            label={t('perf.kpiDwell')}
            value={Number((pv?.summary.avgDwellSec ?? 0).toFixed(0))}
            unit={t('common.uSec')}
            loading={pv === null}
            variant="kpi-4"
            icon={<span aria-hidden>⏱️</span>}
          />
          <StatsCard
            label={t('perf.kpiBounce')}
            value={Number((pv?.summary.bounceRate ?? 0).toFixed(1))}
            unit="%"
            loading={pv === null}
            variant="kpi-5"
            icon={<span aria-hidden>↪️</span>}
          />
        </div>

        {/* PV 추세 */}
        <div className="mt-4 rounded-lg border p-4">
          <p className="mb-2 text-sm font-medium">
            {t('perf.pvTrend')}{' '}
            <span className="text-muted-foreground text-xs">
              {t('common.recentDays', { period })}
            </span>
          </p>
          <LazySection>
            {pv ? (
              <PageviewTrendChart data={pv.pvTrend} />
            ) : (
              <div className="bg-muted h-56 animate-pulse rounded-lg" />
            )}
          </LazySection>
        </div>

        {/* 채널 기여 + 랜딩/이탈 페이지 */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border p-4">
            <p className="mb-3 text-sm font-medium">{t('perf.channel')}</p>
            {pv && pv.channels.length > 0 ? (
              <div className="space-y-2">
                {(() => {
                  const tot = pv.channels.reduce((a, b) => a + b.cnt, 0) || 1
                  return pv.channels.map((c, i) => {
                    const pct = (c.cnt / tot) * 100
                    return (
                      <div key={c.cd} className="text-sm">
                        <div className="mb-1 flex justify-between">
                          <span>{t(`perf.channelCd.${c.cd}`)}</span>
                          <span className="text-muted-foreground">
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                        <div className="bg-muted h-2.5 overflow-hidden rounded-full">
                          <div
                            className={`h-full rounded-full ${PV_BAR[i % PV_BAR.length]}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            ) : (
              <p className="text-muted-foreground py-6 text-center text-sm">
                {t('common.noData')}
              </p>
            )}
          </div>

          <PathList
            title={t('perf.landingTop')}
            items={pv?.topLanding ?? null}
          />
          <PathList title={t('perf.exitTop')} items={pv?.topExit ?? null} />
        </div>

        <p className="text-muted-foreground mt-3 text-xs">
          {t('perf.collectNote')}
        </p>
      </div>
    </div>
  )
}

const PV_BAR = [
  'bg-[var(--kpi-1)]',
  'bg-[var(--kpi-3)]',
  'bg-[var(--kpi-5)]',
  'bg-[var(--kpi-2)]',
  'bg-[var(--kpi-4)]',
]

function PathList({
  title,
  items,
}: {
  title: string
  items: { path: string; cnt: number }[] | null
}) {
  const t = useTranslations('adminAnalytics')
  return (
    <div className="rounded-lg border p-4">
      <p className="mb-3 text-sm font-medium">{title}</p>
      {items === null ? (
        <div className="bg-muted h-24 animate-pulse rounded-lg" />
      ) : items.length > 0 ? (
        <ul className="space-y-1.5 text-sm">
          {items.map((it) => (
            <li key={it.path} className="flex justify-between gap-2">
              <span className="truncate font-mono text-xs">{it.path}</span>
              <span className="text-muted-foreground shrink-0">{it.cnt}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground py-6 text-center text-sm">
          {t('common.noData')}
        </p>
      )}
    </div>
  )
}
