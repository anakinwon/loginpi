'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@/lib/pi-fetch'
import { readCache, writeCache } from '@/lib/client-cache'
import { cn } from '@/lib/utils'
import { StatsDateFilter } from '@/components/admin/stats/stats-date-filter'
import { RevenueTab } from './revenue-tab'
import { OrderTab } from './order-tab'
import { UsageTab } from './usage-tab'
import { PerformanceTab } from './performance-tab'
import type { ActivityStatsResponse } from '@/types/stats'

// 통합 분석 허브 (Phase 22 §12) — 6개 분석 도메인을 4개 탭으로 재편(전 탭 구현 완료).
//   북극성(활성 사용자) 지표를 전 탭 상단에 고정 — "판매는 수단, 활성 사용자가 목표".

const TAB_KEYS = ['usage', 'order', 'revenue', 'perf'] as const
type TabKey = (typeof TAB_KEYS)[number]

function NorthStarMetric({
  label,
  value,
  unit,
}: {
  label: string
  value: string
  unit: string
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-lg font-bold">
        {value}
        <span className="text-muted-foreground ml-1 text-xs font-normal">
          {unit}
        </span>
      </p>
    </div>
  )
}

export function AnalyticsHub() {
  const t = useTranslations('adminAnalytics')
  const [tab, setTab] = useState<TabKey>('usage')
  const [period, setPeriod] = useState(30)
  const [activity, setActivity] = useState<ActivityStatsResponse | null>(null)

  // 북극성: 활성 사용자(MAU)·고착도 — 누적 지표라 period 무관, 최근 30일 1회 조회
  useEffect(() => {
    const cached = readCache<ActivityStatsResponse>('analytics_ns', 5 * 60_000)
    if (cached) setActivity(cached)
    piFetch('/api/admin/stats/activity?period=30')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ActivityStatsResponse | null) => {
        if (d) {
          setActivity(d)
          writeCache('analytics_ns', d)
        }
      })
      .catch(() => {})
  }, [])

  const last = activity?.series.at(-1)
  const mau = last?.mau_cnt ?? 0
  const dau = last?.dau_cnt ?? 0
  const stickiness = mau > 0 ? (dau / mau) * 100 : 0

  return (
    <div className="space-y-5">
      {/* 글로벌 컨트롤바 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatsDateFilter period={period} onChange={setPeriod} />
      </div>

      {/* ⭐ 북극성 배너 — 전 탭 고정 */}
      <div className="rounded-xl border bg-gradient-to-r from-amber-50 to-transparent p-4 dark:from-amber-950/20">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <span className="text-sm font-semibold">{t('northStar.label')}</span>
          <NorthStarMetric
            label={t('northStar.mau')}
            value={mau.toLocaleString()}
            unit={t('common.uPerson')}
          />
          <NorthStarMetric
            label={t('northStar.stickiness')}
            value={stickiness.toFixed(1)}
            unit="%"
          />
          <NorthStarMetric
            label={t('northStar.dau')}
            value={dau.toLocaleString()}
            unit={t('common.uPerson')}
          />
        </div>
        <p className="text-muted-foreground mt-2 text-xs">{t('northStar.note')}</p>
      </div>

      {/* 탭 네비 — 활성 탭을 채운 pill로 강조(선택 구분 명확) */}
      <div className="bg-muted/40 flex gap-1 overflow-x-auto rounded-xl p-1">
        {TAB_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            aria-current={tab === key ? 'page' : undefined}
            className={cn(
              'shrink-0 rounded-lg px-4 py-2 text-sm transition-colors',
              tab === key
                ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground font-medium',
            )}
          >
            {t(`tabs.${key}`)}
          </button>
        ))}
      </div>

      {/* 탭 내용 */}
      {tab === 'revenue' ? (
        <RevenueTab period={period} />
      ) : tab === 'order' ? (
        <OrderTab period={period} />
      ) : tab === 'usage' ? (
        <UsageTab period={period} />
      ) : (
        <PerformanceTab period={period} />
      )}
    </div>
  )
}
