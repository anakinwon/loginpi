'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import PlotlyPlot from '@/components/charts/plotly-plot'
import { useThemeChartColors } from '@/components/charts/use-theme-chart-colors'

// 일별 페이지뷰 추세 (Phase 22 §12 ④).

const BASE_LAYOUT = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { color: '#94a3b8', size: 11 },
  margin: { l: 44, r: 16, t: 10, b: 36 },
  hovermode: 'x unified' as const,
}
const COMMON_CONFIG = { displayModeBar: false, responsive: true } as const
const PLOT_STYLE = { width: '100%', height: '240px' }

export default function PageviewTrendChart({
  data,
}: {
  data: { date: string; cnt: number }[]
}) {
  const colors = useThemeChartColors()
  const t = useTranslations('adminAnalytics.charts')

  const { traces, isEmpty } = useMemo(() => {
    const total = data.reduce((s, d) => s + d.cnt, 0)
    return {
      traces: [
        {
          type: 'scatter' as const,
          mode: 'lines' as const,
          name: t('pvLegend'),
          x: data.map((d) => d.date),
          y: data.map((d) => d.cnt),
          fill: 'tozeroy' as const,
          line: { color: colors[1], width: 2, shape: 'spline' as const },
          hovertemplate: '%{x}<br>%{y} PV<extra></extra>',
        },
      ],
      isEmpty: total === 0,
    }
  }, [data, colors, t])

  if (isEmpty)
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        {t('pvEmpty')}
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
