'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { piFetch } from '@/lib/pi-fetch'
import { readCache, writeCache } from '@/lib/client-cache'
import { LazySection } from '@/components/lazy-section'
import { StatsCard } from '@/components/admin/stats/stats-card'

const OrderHeatmapChart = dynamic(
  () => import('@/components/charts/order-heatmap-chart'),
  { ssr: false },
)
const OrderIntervalChart = dynamic(
  () => import('@/components/charts/order-interval-chart'),
  { ssr: false },
)
const RfmBubbleChart = dynamic(
  () => import('@/components/charts/rfm-bubble-chart'),
  { ssr: false },
)

interface OrdersResponse {
  period: number
  summary: {
    total: number
    completed: number
    cancelled: number
    cancelRate: number
    aovPi: number
    repeatRate: number
    avgIntervalDays: number
    buyers: number
  }
  byMethod: { method: string; label: string; cnt: number }[]
  heatmap: number[][]
  intervalBuckets: { label: string; cnt: number }[]
  rfm: {
    segments: { seg: string; label: string; cnt: number }[]
    points: {
      recencyDays: number
      freq: number
      monetaryPi: number
      seg: string
      segLabel: string
    }[]
    top: {
      usr_id: string
      display_nm: string
      recencyDays: number
      freq: number
      monetaryPi: number
      seg: string
      segLabel: string
    }[]
  }
}

const METHOD_COLORS = ['bg-[var(--kpi-1)]', 'bg-[var(--kpi-3)]', 'bg-[var(--kpi-5)]', 'bg-[var(--kpi-2)]']

// 주문 분석 탭 (Phase 22 §12 ②) — mps_order 직접 집계. 신규 SQL 의존 없음.
export function OrderTab({ period }: { period: number }) {
  const t = useTranslations('adminAnalytics')
  const [data, setData] = useState<OrdersResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchOrders = useCallback(async (p: number) => {
    setError(null)
    const cacheKey = `analytics_orders_${p}`
    const cached = readCache<OrdersResponse>(cacheKey, 5 * 60_000)
    if (cached) setData(cached)
    try {
      const res = await piFetch(`/api/admin/analytics/orders?period=${p}`)
      if (!res.ok) throw new Error('주문 분석 조회 실패')
      const json = (await res.json()) as OrdersResponse
      setData(json)
      writeCache(cacheKey, json)
    } catch (e) {
      if (!cached) setError(e instanceof Error ? e.message : '오류 발생')
    }
  }, [])

  useEffect(() => {
    fetchOrders(period)
  }, [period, fetchOrders])

  if (error)
    return (
      <div className="border-destructive/30 bg-destructive/5 rounded-lg border p-6 text-center">
        <p className="text-destructive text-sm">{error}</p>
        <button
          onClick={() => fetchOrders(period)}
          className="text-muted-foreground mt-2 text-sm underline"
        >
          {t('common.retry')}
        </button>
      </div>
    )

  const s = data?.summary
  const loading = data === null
  const methodTotal = (data?.byMethod ?? []).reduce((a, b) => a + b.cnt, 0) || 1

  return (
    <div className="space-y-5">
      {/* Zone 1 — KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatsCard
          label={t('order.kpiOrders')}
          value={s?.total ?? 0}
          unit={t('common.uCase')}
          loading={loading}
          variant="kpi-1"
          icon={<span aria-hidden>🧾</span>}
        />
        <StatsCard
          label={t('order.kpiAov')}
          value={Number((s?.aovPi ?? 0).toFixed(3))}
          unit="π"
          loading={loading}
          variant="kpi-3"
          icon={<span aria-hidden>💵</span>}
        />
        <StatsCard
          label={t('order.kpiCancel')}
          value={Number((s?.cancelRate ?? 0).toFixed(1))}
          unit="%"
          loading={loading}
          variant="kpi-5"
          icon={<span aria-hidden>↩️</span>}
        />
        <StatsCard
          label={t('order.kpiRepeat')}
          value={Number((s?.repeatRate ?? 0).toFixed(1))}
          unit="%"
          loading={loading}
          variant="kpi-2"
          icon={<span aria-hidden>🔁</span>}
        />
        <StatsCard
          label={t('order.kpiInterval')}
          value={Number((s?.avgIntervalDays ?? 0).toFixed(1))}
          unit={t('common.uDay')}
          loading={loading}
          variant="kpi-4"
          icon={<span aria-hidden>📆</span>}
        />
      </div>

      {/* Zone 2 — 주문방법 분포 + 요일×시간 히트맵 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="mb-3 text-sm font-medium">{t('order.methodTitle')}</p>
          {loading ? (
            <div className="bg-muted h-24 animate-pulse rounded-lg" />
          ) : data && data.byMethod.length > 0 ? (
            <div className="space-y-2">
              {data.byMethod.map((m, i) => {
                const pct = (m.cnt / methodTotal) * 100
                return (
                  <div key={m.method} className="text-sm">
                    <div className="mb-1 flex justify-between">
                      <span>{t(`order.method.${m.method}`)}</span>
                      <span className="text-muted-foreground">
                        {m.cnt}
                        {t('common.uCase')} · {pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="bg-muted h-2.5 overflow-hidden rounded-full">
                      <div
                        className={`h-full rounded-full ${METHOD_COLORS[i % METHOD_COLORS.length]}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {t('order.methodEmpty')}
            </p>
          )}
        </div>

        <div className="rounded-lg border p-4">
          <p className="mb-3 text-sm font-medium">{t('order.heatmapTitle')}</p>
          {loading ? (
            <div className="bg-muted h-32 animate-pulse rounded-lg" />
          ) : (
            <OrderHeatmapChart heatmap={data?.heatmap ?? []} />
          )}
        </div>
      </div>

      {/* Zone 3 — 재구매 간격 히스토그램 */}
      <div className="rounded-lg border p-4">
        <p className="mb-2 text-sm font-medium">
          {t('order.intervalTitle')}{' '}
          <span className="text-muted-foreground text-xs">
            {t('common.recentDays', { period })}
          </span>
        </p>
        <LazySection>
          {data ? (
            <OrderIntervalChart buckets={data.intervalBuckets} />
          ) : (
            <div className="bg-muted h-56 animate-pulse rounded-lg" />
          )}
        </LazySection>
      </div>

      {/* Zone 4 — RFM 세그먼테이션 */}
      <div className="rounded-lg border p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{t('order.rfmTitle')}</p>
          {data && data.rfm.segments.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs">
              {data.rfm.segments
                .sort((a, b) => b.cnt - a.cnt)
                .map((seg) => (
                  <span
                    key={seg.seg}
                    className="bg-muted text-muted-foreground rounded-full px-2 py-0.5"
                  >
                    {t(`order.seg.${seg.seg}`)} {seg.cnt}
                  </span>
                ))}
            </div>
          )}
        </div>
        <LazySection>
          {data ? (
            <RfmBubbleChart points={data.rfm.points} />
          ) : (
            <div className="bg-muted h-72 animate-pulse rounded-lg" />
          )}
        </LazySection>

        {/* 상위 고객 (관리자 전체 표시) */}
        {data && data.rfm.top.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="py-2 pr-2">{t('order.thCustomer')}</th>
                  <th className="py-2 pr-2">{t('order.thSegment')}</th>
                  <th className="py-2 pr-2 text-right">{t('order.thBuy')}</th>
                  <th className="py-2 pr-2 text-right">{t('order.thRecent')}</th>
                  <th className="py-2 text-right">{t('order.thTotal')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rfm.top.map((u) => (
                  <tr key={u.usr_id} className="border-b last:border-0">
                    <td className="max-w-[10rem] truncate py-2 pr-2 font-medium">
                      {u.display_nm}
                    </td>
                    <td className="py-2 pr-2">{t(`order.seg.${u.seg}`)}</td>
                    <td className="py-2 pr-2 text-right">{u.freq}</td>
                    <td className="py-2 pr-2 text-right">{u.recencyDays}</td>
                    <td className="py-2 text-right font-semibold">
                      {u.monetaryPi.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
