'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import { piFetch } from '@/lib/pi-fetch'
import { readCache, writeCache } from '@/lib/client-cache'
import { LazySection } from '@/components/lazy-section'
import { BeanRevenueDistribution } from '@/components/admin/token-distribution'
import { BeanIcon } from '@/components/ui/bean-icon'
import { StatsCard } from './stats-card'
import { StatsDateFilter } from './stats-date-filter'
import { TranslateStatsSection } from './translate-stats-section'
import { BeanTopSpenders } from './bean-top-spenders'
import type {
  ActivityStatsResponse,
  BeanRevenueResponse,
  TopUser,
} from '@/types/stats'

// 매출 항목 중 '구독' 식별 코드 (fn_bean_revenue_summary ref_tp_cd)
const SUBSCR_REF_CD = 'SUBSCR'

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
  // 매출 KPI는 Bean 회수매출 누적(fn_bean_revenue_summary) — period 무관.
  const [beanRev, setBeanRev] = useState<BeanRevenueResponse | null>(null)
  const [loading, setLoading] = useState(true)
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
      .then((r) => {
        // 집계 실패 시 오늘(UTC) 데이터가 화면에 반영되지 않는다 — 원인 추적을 위해 로깅
        if (!r.ok) {
          console.warn('[HOME 통계] 온디맨드 집계 실패 — 오늘 데이터 미반영', r.status)
          return undefined
        }
        return loadActivity()
      })
      .catch((e) => {
        console.warn('[HOME 통계] 온디맨드 집계 요청 오류', e)
      })
  }, [])

  // Bean 매출 KPI — 누적(period 무관)이라 캐시 키도 기간 없이 단일. 매출 섹션 진입 시 1회 로드.
  const fetchBeanRevenue = useCallback(async () => {
    const cacheKey = 'stats_bean_revenue'
    const cached = readCache<BeanRevenueResponse>(cacheKey, 5 * 60_000)
    if (cached) setBeanRev(cached)
    try {
      const res = await piFetch('/api/admin/stats/bean-revenue')
      if (!res.ok) throw new Error('데이터 조회 실패')
      const data = (await res.json()) as BeanRevenueResponse
      setBeanRev(data)
      writeCache(cacheKey, data)
    } catch (e) {
      if (!cached) setError(e instanceof Error ? e.message : '오류 발생')
    }
  }, [])

  useEffect(() => {
    fetchActivity(period)
  }, [period, fetchActivity])

  // 매출 KPI(beanRev)는 누적값(period 무관)이라 섹션 진입 시 1회만 로드.
  // 매출 차트(BeanRevenueTimeline)는 자체적으로 period별 데이터를 조회·관리한다.
  useEffect(() => {
    if (revVisible) fetchBeanRevenue()
  }, [revVisible, fetchBeanRevenue])

  // 기간 내 가장 최신 데이터 포인트에서 DAU/WAU/MAU 추출
  const lastActivity = activityData?.series.at(-1)

  // 매출 KPI — Bean 회수매출 누적(fn_bean_revenue_summary 기반)
  const totalBean = beanRev?.bean_total ?? 0
  const beanTxnCnt =
    beanRev?.bean_by_item.reduce((s, it) => s + it.txn_cnt, 0) ?? 0
  const subscBean =
    beanRev?.bean_by_item
      .filter((it) => it.ref_tp_cd === SUBSCR_REF_CD)
      .reduce((s, it) => s + it.net_bean, 0) ?? 0
  const genBean = totalBean - subscBean // 구독 외 전 항목(방생성·입장·스티커·뱃지 등)

  if (error) {
    return (
      <div className="border-destructive/30 bg-destructive/5 rounded-lg border p-6 text-center">
        <p className="text-destructive text-sm">{error}</p>
        <button
          onClick={() => {
            fetchActivity(period)
            if (revVisible) fetchBeanRevenue()
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
          // 매출 KPI는 bean-revenue RPC를 호출하므로 화면 밖 200px 선행 로드를 피한다.
          // 실제 뷰포트 진입 직전(50px)에만 호출 → 모바일 RPC 낭비 20~40% 절감 (PRD_18 HOME)
          rootMargin="50px"
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
            {/* 매출 KPI 카드 — 누적 Bean 회수매출: 총합 / 거래건수 / 구독 / 일반 */}
            <div className="grid grid-cols-2 gap-3">
              <StatsCard
                label={t('totalRevenue')}
                value={totalBean}
                unitNode={<BeanIcon className="h-4 w-4" />}
                loading={beanRev === null}
              />
              <StatsCard
                label={t('totalTrades')}
                value={beanTxnCnt}
                unit={t('unitCase')}
                loading={beanRev === null}
              />
              <StatsCard
                label={t('subscrRevenue')}
                value={subscBean}
                unitNode={<BeanIcon className="h-4 w-4" />}
                loading={beanRev === null}
              />
              <StatsCard
                label={t('normalRevenue')}
                value={genBean}
                unitNode={<BeanIcon className="h-4 w-4" />}
                loading={beanRev === null}
              />
            </div>

            {/* 매출 시계열 + 도넛 */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-lg border p-4">
                <p className="mb-2 text-sm font-medium">{t('themeDaily')}</p>
                {/* BeanRevenueTimeline은 자체적으로 로딩·빈데이터·오류 상태를 처리하므로
                    별도 게이트 없이 직접 렌더. (과거 stat_revenue_dly 기반 게이트는 Bean 전환으로
                    공급원이 끊겨, 7일 등 단기 기간에서 차트가 영영 표시되지 않던 버그의 원인이었음) */}
                <BeanRevenueTimeline period={period} />
              </div>
              <BeanRevenueDistribution period={period} />
            </div>

            {/* Top-3 지출자 — Pi 결제/테마 랭킹을 Bean 소비액 랭킹으로 교체
                (currency-routing-rule: 플랫폼↔사용자 소비는 Bean이 정본) */}
            <BeanTopSpenders period={period} />
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
