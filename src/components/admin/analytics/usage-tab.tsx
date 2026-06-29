'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { piFetch } from '@/lib/pi-fetch'
import { readCache, writeCache } from '@/lib/client-cache'
import { LazySection } from '@/components/lazy-section'
import { StatsCard } from '@/components/admin/stats/stats-card'
import type { ActivityStatsResponse } from '@/types/stats'

const DauWauMauChart = dynamic(
  () => import('@/components/charts/dau-wau-mau-chart'),
  { ssr: false },
)
const NewReturningChart = dynamic(
  () => import('@/components/charts/new-returning-chart'),
  { ssr: false },
)
const CohortHeatmapChart = dynamic(
  () => import('@/components/charts/cohort-heatmap-chart'),
  { ssr: false },
)

interface UsageResponse {
  period: number
  newReturning: { date: string; newCnt: number; returningCnt: number }[]
  cohort: { cohort: string; size: number; retention: (number | null)[] }[]
  regions: { sido: string; cnt: number }[]
  locatedUsers: number
}

// 접속·사용 분석 탭 (Phase 22 §12 ③) — 활동 로그·가입일·위치를 온더플라이 집계.
export function UsageTab({ period }: { period: number }) {
  const t = useTranslations('adminAnalytics')
  const [activity, setActivity] = useState<ActivityStatsResponse | null>(null)
  const [usage, setUsage] = useState<UsageResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (p: number) => {
    setError(null)
    const actKey = `analytics_activity_${p}`
    const useKey = `analytics_usage_${p}`
    const cachedAct = readCache<ActivityStatsResponse>(actKey, 5 * 60_000)
    const cachedUse = readCache<UsageResponse>(useKey, 5 * 60_000)
    if (cachedAct) setActivity(cachedAct)
    if (cachedUse) setUsage(cachedUse)
    try {
      const [actRes, useRes] = await Promise.all([
        piFetch(`/api/admin/stats/activity?period=${p}`),
        piFetch(`/api/admin/analytics/usage?period=${p}`),
      ])
      if (!actRes.ok || !useRes.ok) throw new Error('사용 분석 조회 실패')
      const act = (await actRes.json()) as ActivityStatsResponse
      const use = (await useRes.json()) as UsageResponse
      setActivity(act)
      setUsage(use)
      writeCache(actKey, act)
      writeCache(useKey, use)
    } catch (e) {
      if (!cachedAct) setError(e instanceof Error ? e.message : '오류 발생')
    }
  }, [])

  useEffect(() => {
    fetchAll(period)
  }, [period, fetchAll])

  if (error)
    return (
      <div className="border-destructive/30 bg-destructive/5 rounded-lg border p-6 text-center">
        <p className="text-destructive text-sm">{error}</p>
        <button
          onClick={() => fetchAll(period)}
          className="text-muted-foreground mt-2 text-sm underline"
        >
          {t('common.retry')}
        </button>
      </div>
    )

  const last = activity?.series.at(-1)
  const dau = last?.dau_cnt ?? 0
  const wau = last?.wau_cnt ?? 0
  const mau = last?.mau_cnt ?? 0
  const stickiness = mau > 0 ? (dau / mau) * 100 : 0
  const periodNew = (usage?.newReturning ?? []).reduce(
    (s, d) => s + d.newCnt,
    0,
  )
  const loading = activity === null
  const regionTotal = (usage?.regions ?? []).reduce((a, b) => a + b.cnt, 0) || 1

  return (
    <div className="space-y-5">
      {/* Zone 1 — KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatsCard
          label={t('usage.kpiDau')}
          value={dau}
          unit={t('common.uPerson')}
          loading={loading}
          variant="kpi-4"
          icon={<span aria-hidden>📅</span>}
        />
        <StatsCard
          label={t('usage.kpiWau')}
          value={wau}
          unit={t('common.uPerson')}
          loading={loading}
          variant="kpi-1"
          icon={<span aria-hidden>📆</span>}
        />
        <StatsCard
          label={t('usage.kpiMau')}
          value={mau}
          unit={t('common.uPerson')}
          loading={loading}
          variant="kpi-3"
          icon={<span aria-hidden>📈</span>}
        />
        <StatsCard
          label={t('usage.kpiStickiness')}
          value={Number(stickiness.toFixed(1))}
          unit="%"
          loading={loading}
          variant="kpi-2"
          icon={<span aria-hidden>🧲</span>}
        />
        <StatsCard
          label={t('usage.kpiNewSignup', { period })}
          value={periodNew}
          unit={t('common.uPerson')}
          loading={usage === null}
          variant="kpi-5"
          icon={<span aria-hidden>✨</span>}
        />
      </div>

      {/* Zone 2 — DAU/WAU/MAU 타임라인 */}
      <div className="rounded-lg border p-4">
        <p className="mb-2 text-sm font-medium">
          {t('usage.timeline')}{' '}
          <span className="text-muted-foreground text-xs">
            {t('common.recentDays', { period })}
          </span>
        </p>
        <LazySection>
          {activity && activity.series.length > 0 ? (
            <DauWauMauChart data={activity.series} />
          ) : (
            <div className="bg-muted h-64 animate-pulse rounded-lg" />
          )}
        </LazySection>
      </div>

      {/* Zone 3 — 신규 vs 재방문 + 지역 분포 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="mb-2 text-sm font-medium">{t('usage.newReturning')}</p>
          <LazySection>
            {usage ? (
              <NewReturningChart data={usage.newReturning} />
            ) : (
              <div className="bg-muted h-56 animate-pulse rounded-lg" />
            )}
          </LazySection>
        </div>

        <div className="rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">{t('usage.region')}</p>
            {usage && (
              <span className="text-muted-foreground text-xs">
                {t('usage.locatedUsers', { n: usage.locatedUsers })}
              </span>
            )}
          </div>
          {usage === null ? (
            <div className="bg-muted h-40 animate-pulse rounded-lg" />
          ) : usage.regions.length > 0 ? (
            <div className="space-y-2">
              {usage.regions.map((r) => {
                const pct = (r.cnt / regionTotal) * 100
                return (
                  <div key={r.sido} className="text-sm">
                    <div className="mb-1 flex justify-between">
                      <span>{r.sido}</span>
                      <span className="text-muted-foreground">
                        {r.cnt}
                        {t('common.uPerson')} · {pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="bg-muted h-2.5 overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full bg-[var(--kpi-3)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {t('usage.regionEmpty')}
            </p>
          )}
        </div>
      </div>

      {/* Zone 4 — 가입 코호트 리텐션 */}
      <div className="rounded-lg border p-4">
        <p className="mb-3 text-sm font-medium">
          {t('usage.cohort')}{' '}
          <span className="text-muted-foreground text-xs">
            {t('usage.cohortRecent')}
          </span>
        </p>
        <LazySection>
          {usage ? (
            <CohortHeatmapChart rows={usage.cohort} />
          ) : (
            <div className="bg-muted h-48 animate-pulse rounded-lg" />
          )}
        </LazySection>
      </div>
    </div>
  )
}
