'use client'

import { useMemo } from 'react'
import PlotlyPlot from '@/components/charts/plotly-plot'
import { useThemeChartColors } from '@/components/charts/use-theme-chart-colors'

// 신규 vs 재방문 일별 스택 막대 (Phase 22 §12 ③).
//   신규 = 그날 활동한 사용자 중 그날 가입자, 재방문 = 그 이전 가입자. 합 = DAU.

const BASE_LAYOUT = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { color: '#94a3b8', size: 11 },
  margin: { l: 40, r: 16, t: 10, b: 36 },
  hovermode: 'x unified' as const,
  legend: { orientation: 'h' as const, y: -0.25, x: 0 },
  barmode: 'stack' as const,
  bargap: 0.2,
}
const COMMON_CONFIG = { displayModeBar: false, responsive: true } as const
const PLOT_STYLE = { width: '100%', height: '256px' }

export default function NewReturningChart({
  data,
}: {
  data: { date: string; newCnt: number; returningCnt: number }[]
}) {
  const colors = useThemeChartColors()

  const { traces, isEmpty } = useMemo(() => {
    const x = data.map((d) => d.date)
    const total = data.reduce((s, d) => s + d.newCnt + d.returningCnt, 0)
    return {
      traces: [
        {
          type: 'bar' as const,
          name: '재방문',
          x,
          y: data.map((d) => d.returningCnt),
          marker: { color: colors[1] },
          hovertemplate: '재방문: %{y}명<extra></extra>',
        },
        {
          type: 'bar' as const,
          name: '신규',
          x,
          y: data.map((d) => d.newCnt),
          marker: { color: colors[2] },
          hovertemplate: '신규: %{y}명<extra></extra>',
        },
      ],
      isEmpty: total === 0,
    }
  }, [data, colors])

  if (isEmpty)
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        해당 기간 활동 데이터가 없습니다.
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
