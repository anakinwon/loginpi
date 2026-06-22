'use client'

import { useMemo } from 'react'
import PlotlyPlot from '@/components/charts/plotly-plot'

// Bean 일별 시계열 차트 — fn_bean_daily_stats RPC(최근 30일 KST, 0-채움) 행을 그대로 시각화.
//   충전(발행+) · 소비(SPEND/SUBSCRIBE/TIP/FEE) · 보상(+) · 환불(+) 4개 흐름을 일자별 선으로.
//   부호 규약은 fn_bean_revenue_summary와 동일(소비는 양수 표시) → 매출 화면과 숫자 정합.

export interface BeanDailyRow {
  stat_dt: string // 'YYYY-MM-DD' (KST)
  charge_bean: number
  spend_bean: number
  reward_bean: number
  refund_bean: number
  txn_cnt: number
}

// Plotly는 hex 색 필요(tailwind 클래스 불가). token/page.tsx KPI 카드 색 계열과 통일.
const FLOWS = [
  { key: 'charge_bean', label: '충전(발행)', hex: '#22c55e' }, // green-500
  { key: 'spend_bean', label: '소비', hex: '#f59e0b' }, // amber-500
  { key: 'reward_bean', label: '보상', hex: '#14b8a6' }, // teal-500
  { key: 'refund_bean', label: '환불', hex: '#f43f5e' }, // rose-500
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
const PLOT_STYLE = { width: '100%', height: '320px' }

export default function BeanDailyChart({ rows }: { rows: BeanDailyRow[] }) {
  const { data, isEmpty } = useMemo(() => {
    const x = rows.map((r) => r.stat_dt)
    const traces = FLOWS.map((f) => ({
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      name: f.label,
      x,
      y: rows.map((r) => Number(r[f.key]) || 0),
      line: { color: f.hex, width: 2 },
      marker: { color: f.hex, size: 4 },
      // π 환산을 hover에 함께(1π = 100 Bean) — 날짜는 x unified 헤더로 표시
      hovertemplate: `${f.label}: %{y:,} Bean<extra></extra>`,
    }))
    // 전 기간 전 흐름이 0이면 빈 상태로 간주
    const total = rows.reduce(
      (s, r) =>
        s + r.charge_bean + r.spend_bean + r.reward_bean + r.refund_bean,
      0,
    )
    return { data: traces, isEmpty: rows.length === 0 || total === 0 }
  }, [rows])

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-medium">일별 추이 (최근 30일 · KST)</p>
        <p className="text-muted-foreground text-xs">
          충전 · 소비 · 보상 · 환불
        </p>
      </div>
      {isEmpty ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          최근 30일간 집계할 Bean 거래가 없습니다.
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
