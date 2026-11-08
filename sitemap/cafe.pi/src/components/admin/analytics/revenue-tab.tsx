'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { piFetch } from '@/lib/pi-fetch'
import { readCache, writeCache } from '@/lib/client-cache'
import { LazySection } from '@/components/lazy-section'
import { StatsCard } from '@/components/admin/stats/stats-card'
import { BeanTopSpenders } from '@/components/admin/stats/bean-top-spenders'
import { PiTopSpenders } from '@/components/admin/stats/pi-top-spenders'
import { BeanRevenueDistribution } from '@/components/admin/token-distribution'
import { useFeeMode } from '@/components/feature-flag-provider'
import { BeanIcon } from '@/components/ui/bean-icon'
import RevenueTreemapChart from '@/components/charts/revenue-treemap-chart'
import BubbleChart from '@/components/charts/bubble-chart'
import { themeColorMap, isSystemThemeCode } from '@/lib/stats-labels'
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
//   - PI 모드: Pi 직결제 기준 KPI로 전환 (rev.series 재활용, 추가 API 없음)
//   - Z-차트·YoY는 월별 집계 엔드포인트 선결 → 후속(아래 안내 카드)
export function RevenueTab({ period }: { period: number }) {
  const t = useTranslations('adminAnalytics')
  const tTheme = useTranslations('themes')
  const tm = useTranslations('adminMgmt.analytics')
  const tc = useTranslations('common')
  const feeMode = useFeeMode()
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
      if (!cached) setError(e instanceof Error ? e.message : tc('error'))
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

  // PI 모드 KPI — rev.series(stat_revenue_dly) 재활용, 추가 API 없음
  const piModeTotal = useMemo(
    () => (rev?.series ?? []).reduce((s, r) => s + r.rev_pi, 0),
    [rev],
  )
  const piModeTxnCnt = useMemo(
    () => (rev?.series ?? []).reduce((s, r) => s + r.txn_cnt, 0),
    [rev],
  )
  const piModeAov = piModeTxnCnt > 0 ? piModeTotal / piModeTxnCnt : 0
  const piModeTopTheme = rev?.topThemes[0]

  // 직전 동일 기간 대비 델타(%) — 비교 기준(prev>0) 없으면 null(배지 미표시)
  const deltaPct = (cur: number, prevVal?: number): number | null =>
    prevVal !== undefined && prevVal > 0
      ? Math.round(((cur - prevVal) / prevVal) * 1000) / 10
      : null
  const totalTrend = deltaPct(piModeTotal, rev?.prev?.total_pi)
  const txnTrend = deltaPct(piModeTxnCnt, rev?.prev?.total_txn)
  const prevAov =
    rev?.prev && rev.prev.total_txn > 0
      ? rev.prev.total_pi / rev.prev.total_txn
      : undefined
  const aovTrend = deltaPct(piModeAov, prevAov)
  // 오늘 실시간 매출 (pi_pymnt 직접 집계 — 일배치 시계열에 없는 당일분)
  const todaySub = rev?.today
    ? tm('todayStat', {
        amount: rev.today.total_pi.toFixed(2),
        count: rev.today.txn_cnt,
      })
    : undefined

  // 테마명 — 시스템 분류 코드(구독·기타 등)는 번역키, 카페 테마명(DB)은 theme_nm 그대로
  const themeName = (cd: string, nm?: string | null) =>
    isSystemThemeCode(cd)
      ? t(`theme.${cd}`)
      : tTheme.has(cd)
        ? tTheme(cd)
        : (nm ?? cd)

  // ABC 분석 대상 — 테마별 Pi 매출 (topThemes)
  const abcItems = useMemo(
    () =>
      (rev?.topThemes ?? []).map((th) => ({
        label: themeName(th.theme_cd, th.theme_nm),
        value: th.total_pi,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rev],
  )

  // 테마별 매출 버블 (Bean 환산: 1 Pi = 100 Bean) — 비중은 단위 불변, 색은 트리맵과 동일 매핑
  const bubbleItems = useMemo(() => {
    const themes = rev?.topThemes ?? []
    const colorOf = themeColorMap(themes.map((th) => th.theme_cd))
    return themes.map((th) => ({
      label: themeName(th.theme_cd, th.theme_nm),
      value: th.total_pi * 100, // Bean 페그 환산 (비중 동일)
      emoji: th.theme_emoji ?? undefined,
      color: colorOf[th.theme_cd],
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev])

  if (error)
    return (
      <div className="border-destructive/30 bg-destructive/5 rounded-lg border p-6 text-center">
        <p className="text-destructive text-sm">{error}</p>
        <button
          onClick={() => fetchRevenue(period)}
          className="text-muted-foreground mt-2 text-sm underline"
        >
          {t('common.retry')}
        </button>
      </div>
    )

  return (
    <div className="space-y-5">
      {/* Zone 1 — KPI 카드: PI 모드는 Pi 직결제 기준, BEAN 모드는 2층위 분리 */}
      {feeMode === 'PI' ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatsCard
            label={tm('kpiTotalPi')}
            value={Number(piModeTotal.toFixed(2))}
            unit="π"
            sub={todaySub}
            trend={totalTrend}
            loading={rev === null}
            variant="kpi-3"
            icon={<span aria-hidden>💰</span>}
          />
          <StatsCard
            label={tm('kpiPiCount')}
            value={piModeTxnCnt}
            unit={t('common.uCase')}
            trend={txnTrend}
            loading={rev === null}
            variant="kpi-1"
            icon={<span aria-hidden>🧾</span>}
          />
          <StatsCard
            label={tm('kpiAov')}
            value={Number(piModeAov.toFixed(3))}
            unit="π"
            trend={aovTrend}
            loading={rev === null}
            variant="kpi-5"
            icon={<span aria-hidden>📊</span>}
          />
          <StatsCard
            label={
              piModeTopTheme
                ? tm('rankOne', {
                    name: themeName(
                      piModeTopTheme.theme_cd,
                      piModeTopTheme.theme_nm,
                    ),
                  })
                : tm('topTheme')
            }
            value={
              piModeTopTheme ? Number(piModeTopTheme.total_pi.toFixed(2)) : 0
            }
            unit="π"
            loading={rev === null}
            variant="kpi-2"
            icon={<span aria-hidden>🏆</span>}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatsCard
            label={t('revenue.kpiPiCash')}
            value={Number(piCash.toFixed(2))}
            unit="π"
            loading={beanRev === null}
            variant="kpi-3"
            icon={<span aria-hidden>💰</span>}
          />
          <StatsCard
            label={t('revenue.kpiBeanRecover')}
            value={beanRecover}
            unitNode={<BeanIcon className="h-4 w-4" />}
            loading={beanRev === null}
            variant="kpi-1"
            icon={<span aria-hidden>♻️</span>}
          />
          <StatsCard
            label={t('revenue.kpiChargeCnt')}
            value={chargeCnt}
            unit={t('common.uCase')}
            loading={beanRev === null}
            variant="kpi-5"
            icon={<span aria-hidden>💳</span>}
          />
          <StatsCard
            label={t('revenue.kpiBeanTxn')}
            value={beanTxnCnt}
            unit={t('common.uCase')}
            loading={beanRev === null}
            variant="kpi-2"
            icon={<span aria-hidden>🧾</span>}
          />
        </div>
      )}

      {/* Zone 2 — 메인: 일별 Pi 매출 + 7일 이동평균 */}
      <div className="rounded-lg border p-4">
        <p className="mb-2 text-sm font-medium">
          {t('revenue.maTitle')}{' '}
          <span className="text-muted-foreground text-xs">
            {t('common.recentDays', { period })}
          </span>
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
          <p className="mb-2 text-sm font-medium">
            {t('revenue.treemapTitle')}
          </p>
          {rev && rev.series.length > 0 ? (
            <RevenueTreemapChart data={rev.series} />
          ) : (
            <div className="bg-muted h-80 animate-pulse rounded-lg" />
          )}
        </div>
        {feeMode === 'PI' ? (
          <div className="rounded-lg border p-4">
            <p className="mb-2 text-sm font-medium">{tm('themePiRank')}</p>
            {rev && rev.topThemes.length > 0 ? (
              <ol className="space-y-2 text-sm">
                {rev.topThemes.slice(0, 5).map((th, i) => (
                  <li key={th.theme_cd} className="flex items-center gap-2">
                    <span className="text-muted-foreground w-4 shrink-0 text-xs">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {th.theme_emoji ? `${th.theme_emoji} ` : ''}
                      {themeName(th.theme_cd, th.theme_nm)}
                    </span>
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      {th.total_pi.toFixed(2)} π
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="bg-muted h-36 animate-pulse rounded-lg" />
            )}
          </div>
        ) : (
          <BeanRevenueDistribution period={period} />
        )}
      </div>

      {/* 테마별 매출 비중 (Bean) — cryptobubbles 스타일 버블 */}
      <div className="rounded-lg border p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium">{t('revenue.bubbleTitle')}</p>
          <span className="text-muted-foreground text-xs">
            {t('revenue.bubbleNote')}
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
        <p className="mb-2 text-sm font-medium">{t('revenue.abcTitle')}</p>
        <LazySection>
          {rev ? (
            <RevenueAbcChart items={abcItems} />
          ) : (
            <div className="bg-muted h-72 animate-pulse rounded-lg" />
          )}
        </LazySection>
      </div>

      {feeMode === 'PI' ? (
        <PiTopSpenders period={period} />
      ) : (
        <BeanTopSpenders period={period} />
      )}

      {/* Z-차트 + YoY — 월별 Pi 매출 추세 (PRD_21 §12 ①) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="mb-2 text-sm font-medium">
            {t('revenue.zchartTitle')}{' '}
            <span className="text-muted-foreground text-xs">
              {t('revenue.zchartUnit')}
            </span>
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
            {t('revenue.yoyTitle')}{' '}
            <span className="text-muted-foreground text-xs">
              {t('revenue.yoyUnit')}
            </span>
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
