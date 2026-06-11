'use client'

import PlotlyPlot from './plotly-plot'
import { themeLabel } from '@/lib/stats-labels'
import type { RevenueDataPoint } from '@/types/stats'

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#f97316']

const BASE_LAYOUT = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { color: '#94a3b8', size: 11 },
  margin: { l: 56, r: 16, t: 10, b: 48 },
  barmode: 'stack' as const,
  legend: { bgcolor: 'transparent', bordercolor: 'transparent', orientation: 'h' as const, y: -0.25 },
  xaxis: { gridcolor: '#334155', zerolinecolor: '#334155', type: 'date' as const },
  yaxis: { gridcolor: '#334155', zerolinecolor: '#334155', rangemode: 'tozero' as const, title: { text: 'Pi', font: { size: 10 } } },
}

interface Props {
  data: RevenueDataPoint[]
}

export default function RevenueTimelineChart({ data }: Props) {
  // 테마 목록 추출 (삽입 순서 유지)
  const themes = [...new Set(data.map(d => d.theme_cd))]
  const dates = [...new Set(data.map(d => d.stat_dt))].sort()

  const traces = themes.map((theme, i) => {
    const revByDate = new Map(
      data.filter(d => d.theme_cd === theme).map(d => [d.stat_dt, d.rev_pi])
    )
    const label = themeLabel(theme)
    return {
      x: dates,
      y: dates.map(dt => revByDate.get(dt) ?? 0),
      type: 'bar' as const,
      name: label,
      marker: { color: COLORS[i % COLORS.length] },
      hovertemplate: `%{x}<br>${label}: %{y:.4f} Pi<extra></extra>`,
    }
  })

  return (
    <PlotlyPlot
      data={traces}
      layout={BASE_LAYOUT}
      style={{ width: '100%', height: '320px' }}
      useResizeHandler
      config={{ displayModeBar: false, responsive: true }}
    />
  )
}
