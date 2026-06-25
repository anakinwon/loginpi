'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { piFetch } from '@/lib/pi-fetch'
import { readCache, writeCache } from '@/lib/client-cache'
import { LazySection } from '@/components/lazy-section'
import { StatsCard } from '@/components/admin/stats/stats-card'
import { BeanTopSpenders } from '@/components/admin/stats/bean-top-spenders'
import { BeanRevenueDistribution } from '@/components/admin/token-distribution'
import { BeanIcon } from '@/components/ui/bean-icon'
import RevenueTreemapChart from '@/components/charts/revenue-treemap-chart'
import BubbleChart from '@/components/charts/bubble-chart'
import { themeLabel, themeColorMap } from '@/lib/stats-labels'
import type { RevenueStatsResponse, BeanRevenueResponse } from '@/types/stats'

// Plotly 차트는 window 의존 → dynamic + ssr:false
const RevenueMaChart = dynamic(
  () => import('@/components/charts/revenue-ma-chart'),
  { ssr: false },
)
const RevenueAbcChart = dynamic(
  () => import('@/components/charts/revenue-abc-chart'),
  { ssr: false },
)
const RevenueZChart = dynamic(
  () => import('@/components/charts/revenue-zchart'),
  { ssr: false },
)
const RevenueYoyChart = dynamic(
  () => import('@/components/charts/revenue-yoy-chart'),
  { ssr: false },
)

interface MonthlyRevenue {
  months: { ym: string; revPi: number; txnCnt: number }[]
}

// 매출 분석 탭 (Phase 22 §12 ①)
//   - 2층위 매출 분리: Pi 현금매출(충전, 외부 유입) vs Bean 회수매출(내부 순환) — 합산 금지
//   - 강화: 일별 매출 + 7일 이동평균, 테마 Treemap, 매출원 도넛, ABC(파레토) 분석
//   - Z-차트·YoY는 월별 집계 엔드포인트 선결 → 후속(아래 안내 카드)
export function RevenueTab({ period }: { period: number }) {
  const [rev, setRev] = useState<RevenueStatsResponse | null>(null)
  const [beanRev, setBeanRev] = useState<BeanRevenueResponse | null>(null)
  const [monthly, setMonthly] = useState<MonthlyRevenue | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchRevenue = useCallback(async (p: number) => {
    setError(null)
    const cacheKey = `analytics_revenue_${p}`
    const cached = readCache<RevenueStatsResponse>(cacheKey, 5 * 60_000)
    if (cached) setRev(cached)
    try {
      const res = await piFetch(`/api/admin/stats/revenue?period=${p}`)
      if (!res.ok) throw new Error('매출 데이터 조회 실패')
      const data = (await res.json()) as RevenueStatsResponse
      setRev(data)
      writeCache(cacheKey, data)
    } catch (e) {
      if (!cached) setError(e instanceof Error ? e.message : '오류 발생')
    }
  }, [])

  const fetchBeanRevenue = useCallback(async () => {
    const cacheKey = 'analytics_bean_revenue'
    const cached = readCache<BeanRevenueResponse>(cacheKey, 5 * 60_000)
    if (cached) setBeanRev(cached)
    try {
      const res = await piFetch('/api/admin/stats/bean-revenue')
      if (!res.ok) throw new Error('Bean 매출 조회 실패')
      const data = (await res.json()) as BeanRevenueResponse
      setBeanRev(data)
      writeCache(cacheKey, data)
    } catch {
      // Bean 매출은 보조 — 실패해도 Pi 매출 화면은 유지
    }
  }, [])

  useEffect(() => {
    fetchRevenue(period)
  }, [period, fetchRevenue])

  useEffect(() => {
    fetchBeanRevenue()
  }, [fetchBeanRevenue])

  // 월별 매출(25개월) — Z-차트·YoY용. 기간 무관 단일 조회.
  const fetchMonthly = useCallback(async () => {
    const cacheKey = 'analytics_revenue_monthly'
    const cached = readCache<MonthlyRevenue>(cacheKey, 10 * 60_000)
    if (cached) setMonthly(cached)
    try {
      const res = await piFetch('/api/admin/analytics/revenue-monthly')
      if (!res.ok) throw new Error('월별 매출 조회 실패')
      const json = (await res.json()) as MonthlyRevenue
      setMonthly(json)
      writeCache(cacheKey, json)
    } catch {
      // Z-차트·YoY는 보조 — 실패해도 본 매출 화면 유지
    }
  }, [])

  useEffect(() => {
    fetchMonthly()
  }, [fetchMonthly])

  // KPI — Pi 현금매출(충전)과 Bean 회수매출을 명확히 분리
  const piCash = beanRev?.pi_revenue.total_pi ?? 0
  const chargeCnt = beanRev?.pi_revenue.charge_cnt ?? 0
  const beanRecover = beanRev?.bean_total ?? 0
  const beanTxnCnt =
    beanRev?.bean_by_item.reduce((s, it) => s + it.txn_cnt, 0) ?? 0

  // ABC 분석 대상 — 테마별 Pi 매출 (topThemes)
  const abcItems = useMemo(
    () =>
      (rev?.topThemes ?? []).map((t) => ({
        label: t.theme_nm ?? themeLabel(t.theme_cd),
        value: t.total_pi,
      })),
    [rev],
  )

  // 테마별 매출 버블 (Bean 환산: 1 Pi = 100 Bean) — 비중은 단위 불변, 색은 트리맵과 동일 매핑
  const bubbleItems = useMemo(() => {
    const themes = rev?.topThemes ?? []
    const colorOf = themeColorMap(themes.map((t) => t.theme_cd))
    return themes.map((t) => ({
      label: t.theme_nm ?? themeLabel(t.theme_cd),
      value: t.total_pi * 100, // Bean 페그 환산 (비중 동일)
      emoji: t.theme_emoji ?? undefined,
      color: colorOf[t.theme_cd],
    }))
  }, [rev])

  if (error)
    return (
      <div className="border-destructive/30 bg-destructive/5 rounded-lg border p-6 text-center">
        <p className="text-destructive text-sm">{error}</p>
        <button
          onClick={() => fetchRevenue(period)}
          className="text-muted-foreground mt-2 text-sm underline"
        >
          다시 시도
        </button>
      </div>
    )

  return (
    <div className="space-y-5">
      {/* Zone 1 — KPI 카드 (2층위 매출 분리) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatsCard
          label="Pi 현금매출 (충전)"
          value={Number(piCash.toFixed(2))}
          unit="π"
          loading={beanRev === null}
          variant="kpi-3"
          icon={<span aria-hidden>💰</span>}
        />
        <StatsCard
          label="Bean 회수매출"
          value={beanRecover}
          unitNode={<BeanIcon className="h-4 w-4" />}
          loading={beanRev === null}
          variant="kpi-1"
          icon={<span aria-hidden>♻️</span>}
        />
        <StatsCard
          label="충전 건수"
          value={chargeCnt}
          unit="건"
          loading={beanRev === null}
          variant="kpi-5"
          icon={<span aria-hidden>💳</span>}
        />
        <StatsCard
          label="Bean 거래 건수"
          value={beanTxnCnt}
          unit="건"
          loading={beanRev === null}
          variant="kpi-2"
          icon={<span aria-hidden>🧾</span>}
        />
      </div>

      {/* Zone 2 — 메인: 일별 Pi 매출 + 7일 이동평균 */}
      <div className="rounded-lg border p-4">
        <p className="mb-2 text-sm font-medium">
          일별 Pi 현금매출 + 7일 이동평균{' '}
          <span className="text-muted-foreground text-xs">· 최근 {period}일</span>
        </p>
        <LazySection>
          {rev ? (
            <RevenueMaChart data={rev.series} maWindow={7} />
          ) : (
            <div className="bg-muted h-64 animate-pulse rounded-lg" />
          )}
        </LazySection>
      </div>

      {/* Zone 3 — 보조 2-up: 테마 Treemap + 매출원 도넛(Bean) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="mb-2 text-sm font-medium">테마별 매출 비중 (Pi)</p>
          {rev && rev.series.length > 0 ? (
            <RevenueTreemapChart data={rev.series} />
          ) : (
            <div className="bg-muted h-80 animate-pulse rounded-lg" />
          )}
        </div>
        <BeanRevenueDistribution period={period} />
      </div>

      {/* 테마별 매출 비중 (Bean) — cryptobubbles 스타일 버블 */}
      <div className="rounded-lg border p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium">테마별 매출 비중 (Bean)</p>
          <span className="text-muted-foreground text-xs">
            버블 크기 = 매출 비중 · 1 Pi = 100 Bean 환산
          </span>
        </div>
        <LazySection>
          {rev ? (
            <BubbleChart items={bubbleItems} />
          ) : (
            <div className="bg-muted h-80 animate-pulse rounded-lg" />
          )}
        </LazySection>
      </div>

      {/* Zone 4 — 상세: ABC(파레토) 분석 + Top 소비자 */}
      <div className="rounded-lg border p-4">
        <p className="mb-2 text-sm font-medium">
          ABC 분석 (파레토) · 테마별 Pi 매출 기여
        </p>
        <LazySection>
          {rev ? (
            <RevenueAbcChart items={abcItems} />
          ) : (
            <div className="bg-muted h-72 animate-pulse rounded-lg" />
          )}
        </LazySection>
      </div>

      <BeanTopSpenders period={period} />

      {/* Z-차트 + YoY — 월별 Pi 매출 추세 (PRD_21 §12 ①) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="mb-2 text-sm font-medium">
            Z-차트 (당월·누계·이동누계){' '}
            <span className="text-muted-foreground text-xs">· Pi 매출</span>
          </p>
          <LazySection>
            {monthly ? (
              <RevenueZChart months={monthly.months} />
            ) : (
              <div className="bg-muted h-72 animate-pulse rounded-lg" />
            )}
          </LazySection>
        </div>
        <div className="rounded-lg border p-4">
          <p className="mb-2 text-sm font-medium">
            전년동기(YoY) 비교{' '}
            <span className="text-muted-foreground text-xs">· 월별 Pi 매출</span>
          </p>
          <LazySection>
            {monthly ? (
              <RevenueYoyChart months={monthly.months} />
            ) : (
              <div className="bg-muted h-72 animate-pulse rounded-lg" />
            )}
          </LazySection>
        </div>
      </div>
    </div>
  )
}
