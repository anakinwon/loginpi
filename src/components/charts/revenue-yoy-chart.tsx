'use client'

import { useMemo } from 'react'
import PlotlyPlot from '@/components/charts/plotly-plot'
import { useThemeChartColors } from '@/components/charts/use-theme-chart-colors'

// 전년동기(YoY) 비교 (Phase 22 §12 ①) — 당해 월별 Pi 매출 vs 전년 동월.
//   months: 오름차순 월별 매출(25개월). 전년 데이터가 없으면 안내 표시(올해만).

interface M {
  ym: string
  revPi: number
}

const BASE_LAYOUT = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { color: '#94a3b8', size: 11 },
  margin: { l: 56, r: 16, t: 10, b: 36 },
  hovermode: 'x unified' as const,
  legend: { orientation: 'h' as const, y: -0.25, x: 0 },
  barmode: 'group' as const,
  bargap: 0.3,
}
const COMMON_CONFIG = { displayModeBar: false, responsive: true } as const
const PLOT_STYLE = { width: '100%', height: '280px' }

export default function RevenueYoyChart({ months }: { months: M[] }) {
  const colors = useThemeChartColors()

  const { traces, isEmpty, hasPrev, curYear } = useMemo(() => {
    if (months.length === 0)
      return { traces: [], isEmpty: true, hasPrev: false, curYear: 0 }
    const byYm = new Map(months.map((m) => [m.ym, m.revPi]))
    const cy = Number(months[months.length - 1].ym.slice(0, 4))
    const disp = months.filter((m) => Number(m.ym.slice(0, 4)) === cy)
    const x = disp.map((m) => `${Number(m.ym.slice(5, 7))}월`)
    const cur = disp.map((m) => m.revPi)
    const prev = disp.map((m) => byYm.get(`${cy - 1}-${m.ym.slice(5, 7)}`) ?? 0)
    const hasPrev = prev.some((v) => v > 0)

    const traces = [
      {
        type: 'bar' as const,
        name: `${cy - 1}년`,
        x,
        y: prev,
        marker: { color: colors[4] },
        hovertemplate: `${cy - 1}년: %{y:.2f} π<extra></extra>`,
      },
      {
        type: 'bar' as const,
        name: `${cy}년`,
        x,
        y: cur,
        marker: { color: colors[2] },
        hovertemplate: `${cy}년: %{y:.2f} π<extra></extra>`,
      },
    ]
    return {
      traces,
      isEmpty: cur.every((v) => v === 0) && !hasPrev,
      hasPrev,
      curYear: cy,
    }
  }, [months, colors])

  if (isEmpty)
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        YoY 비교할 매출 데이터가 없습니다.
      </p>
    )

  return (
    <div>
      <PlotlyPlot
        data={traces}
        layout={BASE_LAYOUT}
        config={COMMON_CONFIG}
        style={PLOT_STYLE}
        useResizeHandler
      />
      {!hasPrev && (
        <p className="text-muted-foreground mt-1 text-center text-[11px]">
          {curYear - 1}년 매출 데이터가 없어 비교 기준이 없습니다 ({curYear}년만
          표시) — 데이터가 누적되면 자동 비교됩니다.
        </p>
      )}
    </div>
  )
}
