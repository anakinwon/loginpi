'use client'

import PlotlyPlot from './plotly-plot'
import { themeLabel } from '@/lib/stats-labels'
import type { RevenueDataPoint } from '@/types/stats'

const COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#84cc16',
  '#f97316',
]

const BASE_LAYOUT = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { color: '#94a3b8', size: 11 },
  margin: { l: 16, r: 16, t: 10, b: 16 },
  legend: {
    bgcolor: 'transparent',
    bordercolor: 'transparent',
    orientation: 'v' as const,
  },
  showlegend: true,
}

interface Props {
  data: RevenueDataPoint[]
}

export default function RevenueDonutChart({ data }: Props) {
  // 테마별 합산
  const themeMap: Record<string, number> = {}
  for (const row of data) {
    themeMap[row.theme_cd] = (themeMap[row.theme_cd] ?? 0) + row.rev_pi
  }

  const themeCds = Object.keys(themeMap)
  const labels = themeCds.map(themeLabel)
  const values = Object.values(themeMap)

  const traces = [
    {
      type: 'pie' as const,
      hole: 0.55,
      labels,
      values,
      marker: { colors: COLORS },
      textinfo: 'percent' as const,
      hovertemplate: '%{label}<br>%{value:.4f} Pi<br>%{percent}<extra></extra>',
    },
  ]

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
