'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { StatsCard } from './stats-card'
import { StatsDateFilter } from './stats-date-filter'
import type { ActivityStatsResponse, RevenueStatsResponse, TopUser, TopTheme, TopSpender } from '@/types/stats'

// 차트는 Plotly(window 의존) 사용 — SSR 불가, dynamic + ssr:false 필수
const DauWauMauChart = dynamic(() => import('@/components/charts/dau-wau-mau-chart'), { ssr: false })
const RevenueTimelineChart = dynamic(() => import('@/components/charts/revenue-timeline-chart'), { ssr: false })
const RevenueDonutChart = dynamic(() => import('@/components/charts/revenue-donut-chart'), { ssr: false })

const MEDALS = ['🥇', '🥈', '🥉']

function TopUsersList({ users, loading }: { users: TopUser[]; loading: boolean }) {
  if (loading) {
    return (
      <div className='space-y-2'>
        {[0, 1, 2].map(i => (
          <div key={i} className='flex items-center gap-3'>
            <div className='h-5 w-5 bg-muted animate-pulse rounded' />
            <div className='h-4 w-32 bg-muted animate-pulse rounded' />
            <div className='ml-auto h-4 w-12 bg-muted animate-pulse rounded' />
          </div>
        ))}
      </div>
    )
  }
  if (users.length === 0) return <p className='text-muted-foreground text-sm'>데이터 없음</p>
  return (
    <ol className='space-y-2'>
      {users.map((u, i) => (
        <li key={u.usr_id} className='flex items-center gap-2 text-sm'>
          <span className='text-base'>{MEDALS[i] ?? `${i + 1}.`}</span>
          <span className='min-w-0 flex-1 truncate font-medium'>{u.display_nm}</span>
          <span className='text-muted-foreground shrink-0'>{u.activity_days}일</span>
        </li>
      ))}
    </ol>
  )
}

function TopThemesList({ themes, loading }: { themes: TopTheme[]; loading: boolean }) {
  if (loading) {
    return (
      <div className='space-y-2'>
        {[0, 1, 2].map(i => (
          <div key={i} className='flex items-center gap-3'>
            <div className='h-5 w-5 bg-muted animate-pulse rounded' />
            <div className='h-4 w-28 bg-muted animate-pulse rounded' />
            <div className='ml-auto h-4 w-14 bg-muted animate-pulse rounded' />
          </div>
        ))}
      </div>
    )
  }
  if (themes.length === 0) return <p className='text-muted-foreground text-sm'>데이터 없음</p>
  return (
    <ol className='space-y-2'>
      {themes.map((t, i) => (
        <li key={t.theme_cd} className='flex items-center gap-2 text-sm'>
          <span className='text-base'>{MEDALS[i] ?? `${i + 1}.`}</span>
          <span className='shrink-0'>{t.theme_emoji ?? ''}</span>
          <span className='min-w-0 flex-1 truncate font-medium'>
            {t.theme_nm ?? t.theme_cd}
          </span>
          <span className='text-muted-foreground shrink-0'>{t.total_pi.toFixed(2)} π</span>
        </li>
      ))}
    </ol>
  )
}

function TopSpendersList({ spenders, loading }: { spenders: TopSpender[]; loading: boolean }) {
  if (loading) {
    return (
      <div className='space-y-2'>
        {[0, 1, 2].map(i => (
          <div key={i} className='flex items-center gap-3'>
            <div className='h-5 w-5 bg-muted animate-pulse rounded' />
            <div className='h-4 w-32 bg-muted animate-pulse rounded' />
            <div className='ml-auto h-4 w-14 bg-muted animate-pulse rounded' />
          </div>
        ))}
      </div>
    )
  }
  if (spenders.length === 0) return <p className='text-muted-foreground text-sm'>데이터 없음</p>
  return (
    <ol className='space-y-2'>
      {spenders.map((s, i) => (
        <li key={s.usr_id} className='flex items-center gap-2 text-sm'>
          <span className='text-base'>{MEDALS[i] ?? `${i + 1}.`}</span>
          <span className='min-w-0 flex-1 truncate font-medium'>{s.display_nm}</span>
          <span className='text-muted-foreground shrink-0'>{s.total_pi.toFixed(2)} π</span>
        </li>
      ))}
    </ol>
  )
}

function RankingCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className='rounded-lg border p-4'>
      <p className='mb-3 text-sm font-semibold'>{title}</p>
      {children}
    </div>
  )
}

export function StatsDashboard() {
  const [period, setPeriod] = useState(30)
  const [activityData, setActivityData] = useState<ActivityStatsResponse | null>(null)
  const [revenueData, setRevenueData] = useState<RevenueStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (p: number) => {
    setLoading(true)
    setError(null)
    try {
      const [actRes, revRes] = await Promise.all([
        fetch(`/api/admin/stats/activity?period=${p}`),
        fetch(`/api/admin/stats/revenue?period=${p}`),
      ])
      if (!actRes.ok || !revRes.ok) throw new Error('데이터 조회 실패')
      const [act, rev] = await Promise.all([
        actRes.json() as Promise<ActivityStatsResponse>,
        revRes.json() as Promise<RevenueStatsResponse>,
      ])
      setActivityData(act)
      setRevenueData(rev)
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류 발생')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData(period) }, [period, fetchData])

  // 기간 내 가장 최신 데이터 포인트에서 DAU/WAU/MAU 추출
  const lastActivity = activityData?.series.at(-1)
  const totalRevPi = revenueData?.series.reduce((s, r) => s + r.rev_pi, 0) ?? 0
  const totalTxn = revenueData?.series.reduce((s, r) => s + r.txn_cnt, 0) ?? 0
  const subscRevPi = revenueData?.series.filter(r => r.theme_cd === 'SUBSCRIPTION').reduce((s, r) => s + r.rev_pi, 0) ?? 0
  const genRevPi = revenueData?.series.filter(r => r.theme_cd !== 'SUBSCRIPTION').reduce((s, r) => s + r.rev_pi, 0) ?? 0

  if (error) {
    return (
      <div className='rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center'>
        <p className='text-destructive text-sm'>{error}</p>
        <button
          onClick={() => fetchData(period)}
          className='mt-2 text-sm underline text-muted-foreground'
        >
          다시 시도
        </button>
      </div>
    )
  }

  return (
    <div className='space-y-8'>
      {/* 기간 필터 */}
      <div className='flex items-center gap-4'>
        <StatsDateFilter period={period} onChange={setPeriod} disabled={loading} />
        {loading && <span className='text-muted-foreground text-sm animate-pulse'>불러오는 중…</span>}
      </div>

      {/* ─── 활성 사용자 섹션 ─────────────────────────── */}
      <section className='space-y-4'>
        <h2 className='text-lg font-semibold'>활성 사용자</h2>

        {/* DAU / WAU / MAU 카드 */}
        <div className='grid grid-cols-3 gap-3'>
          <StatsCard label='DAU' value={lastActivity?.dau_cnt ?? 0} unit='명' loading={loading} />
          <StatsCard label='WAU' value={lastActivity?.wau_cnt ?? 0} unit='명' loading={loading} />
          <StatsCard label='MAU' value={lastActivity?.mau_cnt ?? 0} unit='명' loading={loading} />
        </div>

        {/* DAU/WAU/MAU 추이 차트 */}
        <div className='rounded-lg border p-4'>
          {activityData && activityData.series.length > 0 ? (
            <DauWauMauChart data={activityData.series} />
          ) : (
            <div className='bg-muted h-64 animate-pulse rounded-lg' />
          )}
        </div>

        {/* Top-3 활성 사용자 */}
        <RankingCard title={`Top 3 활성 사용자 (최근 ${period}일)`}>
          <TopUsersList users={activityData?.topUsers ?? []} loading={loading} />
        </RankingCard>
      </section>

      {/* ─── 매출 섹션 ───────────────────────────────── */}
      <section className='space-y-4'>
        <h2 className='text-lg font-semibold'>매출</h2>

        {/* 매출 KPI 카드 — 총합 / 거래건수 / 구독 / 일반 */}
        <div className='grid grid-cols-2 gap-3'>
          <StatsCard
            label={`기간 총 매출 (${period}일)`}
            value={totalRevPi.toFixed(4)}
            unit='π'
            loading={loading}
          />
          <StatsCard
            label='기간 총 거래'
            value={totalTxn}
            unit='건'
            loading={loading}
          />
          <StatsCard
            label='구독 요금제 매출'
            value={subscRevPi.toFixed(4)}
            unit='π'
            loading={loading}
          />
          <StatsCard
            label='일반 요금제 매출'
            value={genRevPi.toFixed(4)}
            unit='π'
            loading={loading}
          />
        </div>

        {/* 매출 시계열 + 도넛 */}
        <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
          <div className='rounded-lg border p-4'>
            <p className='mb-2 text-sm font-medium'>테마별 일별 매출</p>
            {revenueData && revenueData.series.length > 0 ? (
              <RevenueTimelineChart data={revenueData.series} />
            ) : (
              <div className='bg-muted h-64 animate-pulse rounded-lg' />
            )}
          </div>
          <div className='rounded-lg border p-4'>
            <p className='mb-2 text-sm font-medium'>테마별 매출 비중</p>
            {revenueData && revenueData.series.length > 0 ? (
              <RevenueDonutChart data={revenueData.series} />
            ) : (
              <div className='bg-muted h-64 animate-pulse rounded-lg' />
            )}
          </div>
        </div>

        {/* Top-3 지출자 + Top-3 테마 */}
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
          <RankingCard title={`Top 3 구매왕 (최근 ${period}일)`}>
            <TopSpendersList spenders={revenueData?.topSpenders ?? []} loading={loading} />
          </RankingCard>
          <RankingCard title={`Top 3 테마 매출 (최근 ${period}일)`}>
            <TopThemesList themes={revenueData?.topThemes ?? []} loading={loading} />
          </RankingCard>
        </div>
      </section>
    </div>
  )
}
