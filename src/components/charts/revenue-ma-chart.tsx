'use client'

import { useMemo } from 'react'
import PlotlyPlot from '@/components/charts/plotly-plot'
import { useThemeChartColors } from '@/components/charts/use-theme-chart-colors'
import type { RevenueDataPoint } from '@/types/stats'

// 일별 Pi 현금매출 막대 + N일 이동평균 선 (Phase 22 매출 탭 강화).
//   revenue API series(stat_revenue_dly, 테마별 일별 행)를 날짜로 합산 → 일 매출 막대,
//   추세는 후행(trailing) 이동평균 선으로 노이즈를 제거해 표시.

const BASE_LAYOUT = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { color: '#94a3b8', size: 11 },
  margin: { l: 52, r: 16, t: 10, b: 36 },
  hovermode: 'x unified' as const,
  legend: { orientation: 'h' as const, y: -0.2, x: 0 },
  bargap: 0.3,
}
const COMMON_CONFIG = { displayModeBar: false, responsive: true } as const
const PLOT_STYLE = { width: '100%', height: '280px' }

// 후행 이동평균 — 윈도 미충족 구간은 null(connectgaps:false로 선 미표시)
function trailingMA(vals: number[], window: number): (number | null)[] {
  return vals.map((_, i) => {
    if (i < window - 1) return null
    let sum = 0
    for (let j = i - window + 1; j <= i; j++) sum += vals[j]
    return sum / window
  })
}

export default function RevenueMaChart({
  data,
  maWindow = 7,
}: {
  data: RevenueDataPoint[]
  maWindow?: number
}) {
  const colors = useThemeChartColors()

  const { traces, isEmpty } = useMemo(() => {
    // 테마별 행 → 날짜별 Pi 매출 합산
    const byDate = new Map<string, number>()
    for (const r of data)
      byDate.set(r.stat_dt, (byDate.get(r.stat_dt) ?? 0) + r.rev_pi)

    const x = [...byDate.keys()].sort()
    const y = x.map((d) => byDate.get(d) ?? 0)
    const ma = trailingMA(y, maWindow)
    const total = y.reduce((s, v) => s + v, 0)

    const traces = [
      {
        type: 'bar' as const,
        name: '일 매출(π)',
        x,
        y,
        marker: { color: colors[1], opacity: 0.5 },
        hovertemplate: '일 매출: %{y:.4f} π<extra></extra>',
      },
      {
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: `${maWindow}일 이동평균`,
        x,
        y: ma,
        connectgaps: false,
        line: { color: colors[3], width: 2.5, shape: 'spline' as const },
        hovertemplate: `${maWindow}일 평균: %{y:.4f} π<extra></extra>`,
      },
    ]
    return { traces, isEmpty: x.length === 0 || total === 0 }
  }, [data, maWindow, colors])

  if (isEmpty)
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        해당 기간 집계할 Pi 매출이 없습니다.
      </p>
    )

  return (
    <PlotlyPlot
      data={traces}
      layout={BASE_LAYOUT}
      config={COMMON_CONFIG}
      style={PLOT_STYLE}
      useResizeHandler
    />
  )
}
