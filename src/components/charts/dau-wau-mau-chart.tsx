'use client'

import PlotlyPlot from './plotly-plot'
import type { ActivityDataPoint } from '@/types/stats'

const BASE_LAYOUT = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { color: '#94a3b8', size: 11 },
  margin: { l: 48, r: 16, t: 10, b: 48 },
  legend: { bgcolor: 'transparent', bordercolor: 'transparent', orientation: 'h' as const, y: -0.2 },
  xaxis: { gridcolor: '#1e293b', zerolinecolor: '#1e293b', type: 'date' as const },
  yaxis: { gridcolor: '#1e293b', zerolinecolor: '#1e293b', rangemode: 'tozero' as const },
}

// MAU → WAU → DAU 순서: 나중에 그려질수록 위에 렌더링되므로
// DAU(작은 값)가 가장 위에 와야 WAU·MAU 선이 서로 가려지지 않음
const SERIES = [
  {
    key: 'mau_cnt' as const,
    name: 'MAU',
    color: '#4ade80',
    fill: 'rgba(74,222,128,0.10)',
  },
  {
    key: 'wau_cnt' as const,
    name: 'WAU',
    color: '#e879f9',
    fill: 'rgba(232,121,249,0.12)',
  },
  {
    key: 'dau_cnt' as const,
    name: 'DAU',
    color: '#38bdf8',
    fill: 'rgba(56,189,248,0.15)',
  },
]

interface Props {
  data: ActivityDataPoint[]
}

export default function DauWauMauChart({ data }: Props) {
  const dates = data.map(d => d.stat_dt)

  const traces = SERIES.map(s => ({
    x: dates,
    y: data.map(d => d[s.key]),
    type: 'scatter' as const,
    mode: 'lines+markers' as const,
    name: s.name,
    line: { color: s.color, width: 2.5, shape: 'spline' as const, smoothing: 1.3 },
    marker: { size: 6, color: s.color, line: { color: '#0f172a', width: 1.5 } },
    fill: 'tozeroy' as const,
    fillcolor: s.fill,
  }))

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
