'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import PlotlyPlot from '@/components/charts/plotly-plot'
import { useThemeChartColors } from '@/components/charts/use-theme-chart-colors'

// Z-차트 (Phase 22 §12 ①) — 당월(막대) · 누계(YTD) · 이동누계(직전 12개월) 3선.
//   계절성을 제거한 추세 판독: 이동누계 우상향=성장, 평평=정체, 하향=둔화.
//   months: 오름차순 월별 Pi 매출(25개월). 표시는 당해 연도(1월~최신월).

interface M {
  ym: string
  revPi: number
}

const BASE_LAYOUT = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { color: '#94a3b8', size: 11 },
  margin: { l: 56, r: 16, t: 10, b: 40 },
  hovermode: 'x unified' as const,
  legend: { orientation: 'h' as const, y: -0.25, x: 0 },
  bargap: 0.4,
}
const COMMON_CONFIG = { displayModeBar: false, responsive: true } as const
const PLOT_STYLE = { width: '100%', height: '300px' }

export default function RevenueZChart({ months }: { months: M[] }) {
  const colors = useThemeChartColors()
  const t = useTranslations('adminAnalytics.charts')

  const { traces, isEmpty } = useMemo(() => {
    if (months.length === 0) return { traces: [], isEmpty: true }
    const idx = new Map(months.map((m, i) => [m.ym, i]))
    const curYear = months[months.length - 1].ym.slice(0, 4)
    const disp = months.filter((m) => m.ym.slice(0, 4) === curYear)
    const x = disp.map((m) => m.ym)

    const monthly = disp.map((m) => m.revPi)
    let ytd = 0
    const cumulative = disp.map((m) => {
      ytd += m.revPi
      return ytd
    })
    const movingAnnual = disp.map((m) => {
      const i = idx.get(m.ym)!
      let s = 0
      for (let k = Math.max(0, i - 11); k <= i; k++) s += months[k].revPi
      return s
    })

    const traces = [
      {
        type: 'bar' as const,
        name: t('zMonth'),
        x,
        y: monthly,
        marker: { color: colors[1], opacity: 0.55 },
        hovertemplate: '%{y:.2f} π<extra></extra>',
      },
      {
        type: 'scatter' as const,
        mode: 'lines+markers' as const,
        name: t('zYtd'),
        x,
        y: cumulative,
        line: { color: colors[2], width: 2 },
        hovertemplate: '%{y:.2f} π<extra></extra>',
      },
      {
        type: 'scatter' as const,
        mode: 'lines+markers' as const,
        name: t('zMat'),
        x,
        y: movingAnnual,
        line: { color: colors[3], width: 2.5 },
        hovertemplate: '%{y:.2f} π<extra></extra>',
      },
    ]
    const allZero =
      monthly.every((v) => v === 0) && movingAnnual.every((v) => v === 0)
    return { traces, isEmpty: allZero }
  }, [months, colors, t])

  if (isEmpty)
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        {t('zEmpty')}
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
