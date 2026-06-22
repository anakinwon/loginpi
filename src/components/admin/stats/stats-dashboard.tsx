'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import { piFetch } from '@/lib/pi-fetch'
import { readCache, writeCache } from '@/lib/client-cache'
import { themeLabel } from '@/lib/stats-labels'
import { LazySection } from '@/components/lazy-section'
import { BeanRevenueDistribution } from '@/components/admin/token-distribution'
import { StatsCard } from './stats-card'
import { StatsDateFilter } from './stats-date-filter'
import { TranslateStatsSection } from './translate-stats-section'
import type {
  ActivityStatsResponse,
  RevenueStatsResponse,
  TopUser,
  TopTheme,
  TopSpender,
} from '@/types/stats'

// 차트는 Plotly(window 의존) 사용 — SSR 불가, dynamic + ssr:false 필수
const DauWauMauChart = dynamic(
  () => import('@/components/charts/dau-wau-mau-chart'),
  { ssr: false },
)
const BeanRevenueTimeline = dynamic(
  () => import('@/components/admin/bean-daily-chart'),
  { ssr: false },
)
const MEDALS = ['🥇', '🥈', '🥉']

function TopUsersList({
  users,
  loading,
}: {
  users: TopUser[]
  loading: boolean
}) {
  const t = useTranslations('adminStats')
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="bg-muted h-5 w-5 animate-pulse rounded" />
            <div className="bg-muted h-4 w-32 animate-pulse rounded" />
            <div className="bg-muted ml-auto h-4 w-12 animate-pulse rounded" />
          </div>
        ))}
      </div>
    )
  }
  if (users.length === 0)
    return <p className="text-muted-foreground text-sm">{t('noData')}</p>
  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {users.map((u, i) => (
          <li key={u.usr_id || i} className="flex items-center gap-2 text-sm">
            <span className="text-base">{MEDALS[i] ?? `${i + 1}.`}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{u.display_nm}</p>
              <p className="text-muted-foreground text-xs">
                {t('userActivity', {
                  days: u.activity_days,
                  content: u.content_cnt,
                  payments: u.action_cnt,
                })}
              </p>
            </div>
            <span className="shrink-0 font-semibold">
              {t('scorePoints', { score: u.score.toFixed(1) })}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground text-xs">{t('scoreFormula')}</p>
    </div>
  )
}

function TopThemesList({
  themes,
  loading,
}: {
  themes: TopTheme[]
  loading: boolean
}) {
  const tr = useTranslations('adminStats')
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="bg-muted h-5 w-5 animate-pulse rounded" />
            <div className="bg-muted h-4 w-28 animate-pulse rounded" />
            <div className="bg-muted ml-auto h-4 w-14 animate-pulse rounded" />
          </div>
        ))}
      </div>
    )
  }
  if (themes.length === 0)
    return <p className="text-muted-foreground text-sm">{tr('noData')}</p>
  return (
    <ol className="space-y-2">
      {themes.map((t, i) => (
        <li key={t.theme_cd} className="flex items-center gap-2 text-sm">
          <span className="text-base">{MEDALS[i] ?? `${i + 1}.`}</span>
          {/* Bean(PI_TIP)은 이모지 대신 럭셔리 콩 이미지로 표시 */}
          {t.theme_cd === 'PI_TIP' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/bean-noti.png"
              alt="Bean"
              className="inline-block h-6 w-6 shrink-0"
            />
          ) : (
            <span className="shrink-0">{t.theme_emoji ?? ''}</span>
          )}
          <span className="min-w-0 flex-1 truncate font-medium">
            {t.theme_nm ?? themeLabel(t.theme_cd)}
          </span>
          <span className="text-muted-foreground shrink-0">
            {t.total_pi.toFixed(2)} π
          </span>
        </li>
      ))}
    </ol>
  )
}

function TopSpendersList({
  spenders,
  loading,
}: {
  spenders: TopSpender[]
  loading: boolean
}) {
  const t = useTranslations('adminStats')
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="bg-muted h-5 w-5 animate-pulse rounded" />
            <div className="bg-muted h-4 w-32 animate-pulse rounded" />
            <div className="bg-muted ml-auto h-4 w-14 animate-pulse rounded" />
          </div>
        ))}
      </div>
    )
  }
  if (spenders.length === 0)
    return <p className="text-muted-foreground text-sm">{t('noData')}</p>
  return (
    <ol className="space-y-2">
      {spenders.map((s, i) => (
        <li key={s.usr_id || i} className="flex items-center gap-2 text-sm">
          <span className="text-base">{MEDALS[i] ?? `${i + 1}.`}</span>
          <span className="min-w-0 flex-1 truncate font-medium">
            {s.display_nm}
          </span>
          <span className="text-muted-foreground shrink-0">
            {s.total_pi.toFixed(2)} π
          </span>
        </li>
      ))}
    </ol>
  )
}

function RankingCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="mb-3 text-sm font-semibold">{title}</p>
      {children}
    </div>
  )
}

export function StatsDashboard() {
  const t = useTranslations('adminStats')
  const tc = useTranslations('common')
  const [period, setPeriod] = useState(7)
  const [activityData, setActivityData] =
    useState<ActivityStatsResponse | null>(null)
  const [revenueData, setRevenueData] = useState<RevenueStatsResponse | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [revLoading, setRevLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // 매출 섹션이 뷰포트에 진입한 뒤에만 revenue API 호출 (스크롤 지연 로딩)
  const [revVisible, setRevVisible] = useState(false)

  // period 전환 시 늦게 도착한 이전 기간 응답이 화면을 덮어쓰지 않도록 가드
  // (fetch effect보다 먼저 선언 — 같은 렌더 사이클에서 ref가 먼저 동기화된다)
  const periodRef = useRef(period)
  useEffect(() => {
    periodRef.current = period
  }, [period])

  const fetchActivity = useCallback(async (p: number) => {
    setError(null)
    const cacheKey = `stats_activity_${p}`

    // 1) 캐시 즉시 표시 (SWR) — 재방문 시 스켈레톤 없이 0ms 렌더
    const cached = readCache<ActivityStatsResponse>(cacheKey, 5 * 60_000)
    if (cached) {
      setActivityData(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }

    // 어제까지의 롤업으로 즉시 조회 — 온디맨드 집계를 기다리지 않는다
    const loadActivity = async () => {
      const actRes = await piFetch(`/api/admin/stats/activity?period=${p}`)
      if (!actRes.ok) throw new Error('데이터 조회 실패')
      const data = (await actRes.json()) as ActivityStatsResponse
      if (periodRef.current !== p) return // 기간이 바뀌었으면 stale 응답 폐기
      setActivityData(data)
      writeCache(cacheKey, data)
    }

    try {
      await loadActivity()
    } catch (e) {
      if (!cached) setError(e instanceof Error ? e.message : '오류 발생')
    } finally {
      setLoading(false)
    }

    // 2) 온디맨드 집계는 백그라운드 병렬 — 완료되면 오늘(UTC) 행을 반영해 한 번 더 갱신
    //    (기존: 집계 완료까지 화면 전체 대기 — HOME 로딩 지연의 주범)
    //    ondemand: true → 배치 이력에 MANUAL(수동)이 아닌 ONDEMAND(자동)로 기록
    void piFetch('/api/admin/stats/aggregate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ondemand: true }),
    })
      .then((r) => (r.ok ? loadActivity() : undefined))
      .catch(() => {})
  }, [])

  const fetchRevenue = useCallback(async (p: number) => {
    const cacheKey = `stats_revenue_${p}`
    const cached = readCache<RevenueStatsResponse>(cacheKey, 5 * 60_000)
    if (cached) {
      setRevenueData(cached)
      setRevLoading(false)
    } else {
      setRevLoading(true)
    }
    try {
      const revRes = await piFetch(`/api/admin/stats/revenue?period=${p}`)
      if (!revRes.ok) throw new Error('데이터 조회 실패')
      const data = (await revRes.json()) as RevenueStatsResponse
      if (periodRef.current !== p) return
      setRevenueData(data)
      writeCache(cacheKey, data)
    } catch (e) {
      if (!cached) setError(e instanceof Error ? e.message : '오류 발생')
    } finally {
      setRevLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchActivity(period)
  }, [period, fetchActivity])

  // 매출 데이터는 섹션이 화면에 보일 때 최초 로드, 이후 기간 변경 시 갱신
  useEffect(() => {
    if (revVisible) fetchRevenue(period)
  }, [revVisible, period, fetchRevenue])

  // 기간 내 가장 최신 데이터 포인트에서 DAU/WAU/MAU 추출
  const lastActivity = activityData?.series.at(-1)
  const totalRevPi = revenueData?.series.reduce((s, r) => s + r.rev_pi, 0) ?? 0
  const totalTxn = revenueData?.series.reduce((s, r) => s + r.txn_cnt, 0) ?? 0
  const subscRevPi =
    revenueData?.series
      .filter((r) => r.theme_cd === 'SUBSCRIPTION')
      .reduce((s, r) => s + r.rev_pi, 0) ?? 0
  const genRevPi =
    revenueData?.series
      .filter((r) => r.theme_cd !== 'SUBSCRIPTION')
      .reduce((s, r) => s + r.rev_pi, 0) ?? 0

  if (error) {
    return (
      <div className="border-destructive/30 bg-destructive/5 rounded-lg border p-6 text-center">
        <p className="text-destructive text-sm">{error}</p>
        <button
          onClick={() => {
            fetchActivity(period)
            if (revVisible) fetchRevenue(period)
          }}
          className="text-muted-foreground mt-2 text-sm underline"
        >
          {tc('retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* 기간 필터 */}
      <div className="flex items-center gap-4">
        <StatsDateFilter
          period={period}
          onChange={setPeriod}
          disabled={loading}
        />
        {loading && (
          <span className="text-muted-foreground animate-pulse text-sm">
            {tc('fetching')}
          </span>
        )}
      </div>

      {/* ─── 활성 사용자 섹션 ─────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t('activeUsers')}</h2>

        {/* DAU / WAU / MAU 카드 */}
        <div className="grid grid-cols-3 gap-3">
          <StatsCard
            label="DAU"
            value={lastActivity?.dau_cnt ?? 0}
            unit={t('unitPerson')}
            loading={loading}
          />
          <StatsCard
            label="WAU"
            value={lastActivity?.wau_cnt ?? 0}
            unit={t('unitPerson')}
            loading={loading}
          />
          <StatsCard
            label="MAU"
            value={lastActivity?.mau_cnt ?? 0}
            unit={t('unitPerson')}
            loading={loading}
          />
        </div>

        {/* DAU/WAU/MAU 추이 차트 — 뷰포트 진입 시에만 Plotly 마운트 */}
        <div className="rounded-lg border p-4">
          <LazySection>
            {activityData && activityData.series.length > 0 ? (
              <DauWauMauChart data={activityData.series} />
            ) : (
              <div className="bg-muted h-64 animate-pulse rounded-lg" />
            )}
          </LazySection>
        </div>

        {/* Top-3 활성 사용자 */}
        <RankingCard title={t('top3Active', { period })}>
          <TopUsersList
            users={activityData?.topUsers ?? []}
            loading={loading}
          />
        </RankingCard>
      </section>

      {/* ─── 매출 섹션 — 스크롤 진입 시 데이터 로드 + 차트 마운트 ───── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t('revenue')}</h2>

        <LazySection
          onVisible={() => setRevVisible(true)}
          fallback={
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="bg-muted h-20 animate-pulse rounded-lg"
                  />
                ))}
              </div>
              <div className="bg-muted h-64 animate-pulse rounded-lg" />
            </div>
          }
        >
          <div className="space-y-4">
            {/* 매출 KPI 카드 — 총합 / 거래건수 / 구독 / 일반 */}
            <div className="grid grid-cols-2 gap-3">
              <StatsCard
                label={t('totalRevenue', { period })}
                value={totalRevPi.toFixed(4)}
                unit="π"
                loading={revLoading}
              />
              <StatsCard
                label={t('totalTrades')}
                value={totalTxn}
                unit={t('unitCase')}
                loading={revLoading}
              />
              <StatsCard
                label={t('subscrRevenue')}
                value={subscRevPi.toFixed(4)}
                unit="π"
                loading={revLoading}
              />
              <StatsCard
                label={t('normalRevenue')}
                value={genRevPi.toFixed(4)}
                unit="π"
                loading={revLoading}
              />
            </div>

            {/* 매출 시계열 + 도넛 */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-lg border p-4">
                <p className="mb-2 text-sm font-medium">{t('themeDaily')}</p>
                {revenueData && revenueData.series.length > 0 ? (
                  <BeanRevenueTimeline period={period} />
                ) : (
                  <div className="bg-muted h-64 animate-pulse rounded-lg" />
                )}
              </div>
              <BeanRevenueDistribution period={period} />
            </div>

            {/* Top-3 지출자 + Top-3 테마 */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <RankingCard title={t('top3Buyers', { period })}>
                <TopSpendersList
                  spenders={revenueData?.topSpenders ?? []}
                  loading={revLoading}
                />
              </RankingCard>
              <RankingCard title={t('top3Themes', { period })}>
                <TopThemesList
                  themes={revenueData?.topThemes ?? []}
                  loading={revLoading}
                />
              </RankingCard>
            </div>
          </div>
        </LazySection>
      </section>

      {/* ─── 번역 섹션 (PiTranslate™) — 스크롤 진입 시 마운트·로드 ───── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t('translateSection')}</h2>
        <LazySection
          fallback={
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="bg-muted h-20 animate-pulse rounded-lg"
                  />
                ))}
              </div>
              <div className="bg-muted h-40 animate-pulse rounded-lg" />
            </div>
          }
        >
          <TranslateStatsSection period={period} />
        </LazySection>
      </section>
    </div>
  )
}
