'use client'

import { useMemo } from 'react'
import PlotlyPlot from '@/components/charts/plotly-plot'

// 단일 리소스 사용률 도넛 — 한도 대비 사용량. 중앙에 사용률 %, 70/90% 임계로 색 전환.
//   초록(<70%) → amber(70~90%) → 빨강(≥90%). 잔여는 흐린 회색.

export default function UsageDonut({
  used,
  limit,
  unit,
}: {
  used: number
  limit: number
  unit: string
}) {
  const { data, layout } = useMemo(() => {
    const pct = limit > 0 ? (used / limit) * 100 : 0
    const usedColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e'
    const remain = Math.max(0, limit - used)

    const data = [
      {
        type: 'pie' as const,
        hole: 0.64,
        values: [used, remain],
        labels: ['사용', '잔여'],
        marker: { colors: [usedColor, 'rgba(148,163,184,0.18)'] },
        textinfo: 'none' as const,
        hovertemplate: `%{label}: %{value:,.2f} ${unit}<extra></extra>`,
        sort: false,
        direction: 'clockwise' as const,
        rotation: 0,
      },
    ]

    const layout = {
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { color: '#94a3b8', size: 11 },
      margin: { l: 6, r: 6, t: 6, b: 6 },
      showlegend: false,
      annotations: [
        {
          text: `<b>${pct.toFixed(0)}%</b>`,
          x: 0.5,
          y: 0.5,
          font: { size: 22, color: usedColor },
          showarrow: false,
        },
      ],
    }

    return { data, layout }
  }, [used, limit, unit])

  return (
    <PlotlyPlot
      data={data}
      layout={layout}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%', height: '150px' }}
      useResizeHandler
    />
  )
}
