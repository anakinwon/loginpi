'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import PlotlyPlot from '@/components/charts/plotly-plot'
import { BeanIcon } from '@/components/ui/bean-icon'
import { piFetch } from '@/lib/pi-fetch'

// Bean 매출 일별 시계열 (self-contained) — 메인 대시보드 매출 시계열 슬롯 교체용.
//   period prop만 받고 자체적으로 /api/admin/token/stats(=fn_bean_daily_stats)를 조회.
//   충전(발행)·소비·보상·환불 4개 흐름을 일자별 선으로. 단위는 π가 아닌 Bean.
//   ⚠️ Bean 시각 표기는 BeanIcon(/bean.png)만 사용 — 콩 이모지 금지(프로젝트 규칙).

interface BeanDailyRow {
  stat_dt: string // 'YYYY-MM-DD' (KST)
  charge_bean: number
  spend_bean: number
  reward_bean: number
  refund_bean: number
  txn_cnt: number
}

// Plotly는 hex 색 필요(tailwind 클래스 불가). token 대시보드 KPI 색 계열과 통일.
const FLOWS = [
  { key: 'charge_bean', labelKey: 'beanFlowCharge', hex: '#22c55e' }, // green-500
  { key: 'spend_bean', labelKey: 'beanFlowSpend', hex: '#f59e0b' }, // amber-500
  { key: 'reward_bean', labelKey: 'beanFlowReward', hex: '#14b8a6' }, // teal-500
  { key: 'refund_bean', labelKey: 'beanFlowRefund', hex: '#f43f5e' }, // rose-500
] as const

// 라이트/다크 양쪽에서 보이는 중립 폰트색 (subscr-stats-charts와 동일 규약)
const BASE_LAYOUT = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { color: '#94a3b8', size: 11 },
  margin: { l: 48, r: 16, t: 10, b: 36 },
  hovermode: 'x unified' as const,
  legend: { orientation: 'h' as const, y: -0.2, x: 0 },
}
const COMMON_CONFIG = { displayModeBar: false, responsive: true } as const
const PLOT_STYLE = { width: '100%', height: '256px' }

export default function BeanRevenueTimeline({
  period = 30,
}: {
  period?: number
}) {
  const t = useTranslations('adminStats')
  const [rows, setRows] = useState<BeanDailyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // period 변경 시 재조회. endpoint는 최근 30일 고정 반환 → 아래 useMemo에서 period일만 슬라이스.
  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(false)
    piFetch('/api/admin/token/stats')
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
      )
      .then((d: { trends?: BeanDailyRow[] }) => {
        if (alive) setRows(d.trends ?? [])
      })
      .catch(() => {
        if (alive) setError(true)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [period])

  const { data, isEmpty } = useMemo(() => {
    // 선택 기간(period일)만 — endpoint가 제공하는 최대 30일 내에서 뒤에서 슬라이스
    const sliced = period > 0 ? rows.slice(-period) : rows
    const x = sliced.map((r) => r.stat_dt)
    const traces = FLOWS.map((f) => ({
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      name: t(f.labelKey),
      x,
      y: sliced.map((r) => Number(r[f.key]) || 0),
      // 활성 사용자 그래프와 동일한 spline 곡선으로 부드럽게 표현
      line: { color: f.hex, width: 2, shape: 'spline' as const, smoothing: 1.3 },
      marker: { color: f.hex, size: 4 },
      hovertemplate: `${t(f.labelKey)}: %{y:,} Bean<extra></extra>`,
    }))
    const total = sliced.reduce(
      (s, r) =>
        s + r.charge_bean + r.spend_bean + r.reward_bean + r.refund_bean,
      0,
    )
    return { data: traces, isEmpty: sliced.length === 0 || total === 0 }
  }, [rows, period, t])

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-muted-foreground flex items-center gap-1 text-xs">
          {t('beanUnitPrefix')}{' '}
          <BeanIcon className="inline-block h-3.5 w-3.5" />{' '}
          {t('beanUnitSuffix', { period })}
        </span>
        <span className="text-muted-foreground text-xs">
          {t('beanFlowsCaption')}
        </span>
      </div>
      {loading ? (
        <div className="bg-muted h-64 animate-pulse rounded-lg" />
      ) : error ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          {t('beanError')}
        </p>
      ) : isEmpty ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          {t('beanEmpty')}
        </p>
      ) : (
        <PlotlyPlot
          data={data}
          layout={BASE_LAYOUT}
          config={COMMON_CONFIG}
          style={PLOT_STYLE}
          useResizeHandler
        />
      )}
    </div>
  )
}
