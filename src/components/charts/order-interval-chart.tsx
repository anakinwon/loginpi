'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import PlotlyPlot from '@/components/charts/plotly-plot'
import { useThemeChartColors } from '@/components/charts/use-theme-chart-colors'

// 재구매 간격 히스토그램 (Phase 22 §12 ②) — 같은 구매자의 연속 완료주문 사이 일수 분포.

const BASE_LAYOUT = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { color: '#94a3b8', size: 11 },
  margin: { l: 44, r: 16, t: 10, b: 40 },
  bargap: 0.25,
}
const COMMON_CONFIG = { displayModeBar: false, responsive: true } as const
const PLOT_STYLE = { width: '100%', height: '240px' }

export default function OrderIntervalChart({
  buckets,
}: {
  buckets: { label: string; cnt: number }[]
}) {
  const colors = useThemeChartColors()
  const t = useTranslations('adminAnalytics.charts')

  const { traces, isEmpty } = useMemo(() => {
    const total = buckets.reduce((s, b) => s + b.cnt, 0)
    return {
      traces: [
        {
          type: 'bar' as const,
          x: buckets.map((b) => b.label),
          y: buckets.map((b) => b.cnt),
          marker: { color: colors[1] },
          hovertemplate: '%{x}: %{y}<extra></extra>',
        },
      ],
      isEmpty: total === 0,
    }
  }, [buckets, colors])

  if (isEmpty)
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        {t('intervalEmpty')}
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
