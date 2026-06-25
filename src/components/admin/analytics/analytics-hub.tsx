'use client'

import { useEffect, useState } from 'react'
import { piFetch } from '@/lib/pi-fetch'
import { readCache, writeCache } from '@/lib/client-cache'
import { cn } from '@/lib/utils'
import { StatsDateFilter } from '@/components/admin/stats/stats-date-filter'
import { RevenueTab } from './revenue-tab'
import type { ActivityStatsResponse } from '@/types/stats'

// 통합 분석 허브 (Phase 22 §12) — 6개 분석 도메인을 4개 탭으로 재편.
//   Phase 2 범위: ① 매출 분석 탭 완성. ②~④는 후속(플레이스홀더).
//   북극성(활성 사용자) 지표를 전 탭 상단에 고정 — "판매는 수단, 활성 사용자가 목표".

const TABS = [
  { key: 'revenue', label: '💰 매출 분석', phase: '' },
  { key: 'order', label: '🧾 주문 분석', phase: 'Phase 3 (코호트·RFM)' },
  { key: 'usage', label: '👥 접속·사용 분석', phase: 'Phase 3~4 (코호트·지리)' },
  { key: 'perf', label: '⚡ 퍼포먼스 분석', phase: 'Phase 4~6 (세션 추적 선결)' },
] as const
type TabKey = (typeof TABS)[number]['key']

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

function ComingSoon({ phase }: { phase: string }) {
  return (
    <div className="border-muted-foreground/20 bg-muted/30 flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
      <p className="text-2xl">🛠️</p>
      <p className="mt-2 text-sm font-medium">구현 예정</p>
      <p className="text-muted-foreground mt-1 text-xs">
        {phase} 단계에서 제공됩니다. (정본: docs/PRD_21_DATA_ANAL.md §12)
      </p>
    </div>
  )
}

export function AnalyticsHub() {
  const [tab, setTab] = useState<TabKey>('revenue')
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
          <span className="text-sm font-semibold">⭐ 북극성 지표</span>
          <NorthStarMetric
            label="활성 사용자 (MAU)"
            value={mau.toLocaleString('ko-KR')}
            unit="명"
          />
          <NorthStarMetric
            label="고착도 (DAU/MAU)"
            value={stickiness.toFixed(1)}
            unit="%"
          />
          <NorthStarMetric
            label="DAU"
            value={dau.toLocaleString('ko-KR')}
            unit="명"
          />
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          판매·매출은 수단입니다. 활성 사용자 수가 최우선 목표입니다.
        </p>
      </div>

      {/* 탭 네비 */}
      <div className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              tab === t.key
                ? 'border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 탭 내용 */}
      {tab === 'revenue' ? (
        <RevenueTab period={period} />
      ) : (
        <ComingSoon phase={TABS.find((t) => t.key === tab)?.phase ?? ''} />
      )}
    </div>
  )
}
