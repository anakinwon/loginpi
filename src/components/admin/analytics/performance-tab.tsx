'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { piFetch } from '@/lib/pi-fetch'
import { readCache, writeCache } from '@/lib/client-cache'
import { LazySection } from '@/components/lazy-section'
import { StatsCard } from '@/components/admin/stats/stats-card'

const FunnelChart = dynamic(() => import('@/components/charts/funnel-chart'), {
  ssr: false,
})

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
  engagementDepth: { label: string; cnt: number }[]
  activeUsersPeriod: number
  sessionTrackingPending: boolean
}

const TYPE_COLORS = ['bg-[var(--kpi-1)]', 'bg-[var(--kpi-3)]', 'bg-[var(--kpi-5)]', 'bg-[var(--kpi-2)]', 'bg-[var(--kpi-4)]']

// 퍼포먼스 분석 탭 (Phase 22 §12 ④) — 라이프사이클 퍼널·전환율·활동구성·참여깊이.
//   페이지뷰·체류·반송/이탈·채널은 세션 추적층 선결(아래 안내 카드).
export function PerformanceTab({ period }: { period: number }) {
  const [data, setData] = useState<PerfResponse | null>(null)
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
      if (!cached) setError(e instanceof Error ? e.message : '오류 발생')
    }
  }, [])

  useEffect(() => {
    fetchPerf(period)
  }, [period, fetchPerf])

  if (error)
    return (
      <div className="border-destructive/30 bg-destructive/5 rounded-lg border p-6 text-center">
        <p className="text-destructive text-sm">{error}</p>
        <button
          onClick={() => fetchPerf(period)}
          className="text-muted-foreground mt-2 text-sm underline"
        >
          다시 시도
        </button>
      </div>
    )

  const c = data?.conversion
  const loading = data === null
  const typeTotal = (data?.activityTypes ?? []).reduce((a, b) => a + b.cnt, 0) || 1
  const depthMax = Math.max(1, ...(data?.engagementDepth ?? []).map((d) => d.cnt))

  return (
    <div className="space-y-5">
      {/* Zone 1 — 전환율 KPI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatsCard
          label="가입 → 활동 전환"
          value={Number((c?.signupToActive ?? 0).toFixed(1))}
          unit="%"
          loading={loading}
          variant="kpi-1"
          icon={<span aria-hidden>🔓</span>}
        />
        <StatsCard
          label="활동 → 구매 전환"
          value={Number((c?.activeToBuyer ?? 0).toFixed(1))}
          unit="%"
          loading={loading}
          variant="kpi-3"
          icon={<span aria-hidden>🛒</span>}
        />
        <StatsCard
          label="구매 → 재구매 전환"
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
          라이프사이클 전환 퍼널{' '}
          <span className="text-muted-foreground text-xs">· 누적(전체)</span>
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
            활동 유형 분포{' '}
            <span className="text-muted-foreground text-xs">· 최근 {period}일</span>
          </p>
          {loading ? (
            <div className="bg-muted h-24 animate-pulse rounded-lg" />
          ) : data && data.activityTypes.length > 0 ? (
            <div className="space-y-2">
              {data.activityTypes.map((t, i) => {
                const pct = (t.cnt / typeTotal) * 100
                return (
                  <div key={t.cd} className="text-sm">
                    <div className="mb-1 flex justify-between">
                      <span>{t.label}</span>
                      <span className="text-muted-foreground">
                        {t.cnt}건 · {pct.toFixed(0)}%
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
              해당 기간 활동 데이터가 없습니다.
            </p>
          )}
        </div>

        <div className="rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">참여 깊이 (활동일수)</p>
            {data && (
              <span className="text-muted-foreground text-xs">
                활동자 {data.activeUsersPeriod}명
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
                  <div key={d.label} className="text-sm">
                    <div className="mb-1 flex justify-between">
                      <span>{d.label}</span>
                      <span className="text-muted-foreground">{d.cnt}명</span>
                    </div>
                    <div className="bg-muted h-2.5 overflow-hidden rounded-full">
                      <div
                        className="bg-[var(--kpi-4)] h-full rounded-full"
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

      {/* 세션 추적 선결 안내 */}
      <div className="border-muted-foreground/20 bg-muted/30 rounded-lg border border-dashed p-4">
        <p className="text-sm font-medium">
          🧭 페이지뷰 · 체류시간 · 반송/이탈률 · 채널 기여 — 준비 중
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          이 지표들은 <strong>세션·페이지뷰 추적층</strong>이 필요합니다. 현재 활동
          로그는 “사용자×일자 1행”이라 페이지 단위·체류시간 데이터가 없습니다.
          신규 추적(예: <code>stat_session_pageview</code> + 클라이언트 페이지뷰
          수집) 도입 후 전환 퍼널을 방문 단계까지 확장하고 반송/이탈·채널 분석을
          활성화합니다. (PRD_21 §3-5 · §6)
        </p>
      </div>
    </div>
  )
}
