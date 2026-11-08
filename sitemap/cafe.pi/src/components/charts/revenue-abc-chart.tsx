'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import PlotlyPlot from '@/components/charts/plotly-plot'
import { useThemeChartColors } from '@/components/charts/use-theme-chart-colors'

// ABC 분석(파레토) — 매출 기여 내림차순 막대 + 누적 % 선(보조축).
//   A(누적 ≤80%)·B(≤95%)·C(나머지) 등급으로 "소수 항목이 매출 대부분" 구조를 가시화.
//   items: 분석 대상(테마/카테고리/상품) 라벨 + Pi 매출액.

export interface AbcItem {
  label: string
  value: number
}

const BASE_LAYOUT = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { color: '#94a3b8', size: 11 },
  margin: { l: 52, r: 48, t: 10, b: 64 },
  hovermode: 'x unified' as const,
  legend: { orientation: 'h' as const, y: -0.32, x: 0 },
  bargap: 0.3,
}
const COMMON_CONFIG = { displayModeBar: false, responsive: true } as const
const PLOT_STYLE = { width: '100%', height: '300px' }

function gradeOf(cumPct: number): 'A' | 'B' | 'C' {
  if (cumPct <= 80) return 'A'
  if (cumPct <= 95) return 'B'
  return 'C'
}

export default function RevenueAbcChart({ items }: { items: AbcItem[] }) {
  const colors = useThemeChartColors()
  const t = useTranslations('adminAnalytics.charts')

  const { traces, layout, isEmpty, summary } = useMemo(() => {
    const sorted = items
      .filter((i) => i.value > 0)
      .sort((a, b) => b.value - a.value)
    const total = sorted.reduce((s, i) => s + i.value, 0)

    let cum = 0
    const cumPct: number[] = []
    const barColors: string[] = []
    const grades: ('A' | 'B' | 'C')[] = []
    for (const it of sorted) {
      cum += it.value
      const p = total > 0 ? (cum / total) * 100 : 0
      cumPct.push(p)
      const g = gradeOf(p)
      grades.push(g)
      barColors.push(g === 'A' ? colors[2] : g === 'B' ? colors[3] : colors[4])
    }

    const x = sorted.map((i) => i.label)
    const traces = [
      {
        type: 'bar' as const,
        name: t('abcRev'),
        x,
        y: sorted.map((i) => i.value),
        marker: { color: barColors },
        hovertemplate: '%{y:.4f} π<extra></extra>',
      },
      {
        type: 'scatter' as const,
        mode: 'lines+markers' as const,
        name: t('abcCum'),
        x,
        y: cumPct,
        yaxis: 'y2',
        line: { color: colors[0], width: 2 },
        marker: { size: 5 },
        // plotly %{...} 토큰은 next-intl ICU 파싱과 충돌 → 접두 라벨만 t()로 붙인다
        hovertemplate: `${t('abcCumHover')}: %{y:.1f}%<extra></extra>`,
      },
    ]

    const layout = {
      ...BASE_LAYOUT,
      yaxis2: {
        overlaying: 'y' as const,
        side: 'right' as const,
        range: [0, 105],
        ticksuffix: '%',
        showgrid: false,
        color: '#94a3b8',
      },
    }

    const counts = {
      A: grades.filter((g) => g === 'A').length,
      B: grades.filter((g) => g === 'B').length,
      C: grades.filter((g) => g === 'C').length,
    }
    return {
      traces,
      layout,
      isEmpty: sorted.length === 0 || total === 0,
      summary: counts,
    }
  }, [items, colors, t])

  if (isEmpty)
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        {t('abcEmpty')}
      </p>
    )

  return (
    <div>
      <PlotlyPlot
        data={traces}
        layout={layout}
        config={COMMON_CONFIG}
        style={PLOT_STYLE}
        useResizeHandler
      />
      <p className="text-muted-foreground mt-1 text-center text-xs">
        {t('abcSummary', { a: summary.A, b: summary.B, c: summary.C })}
      </p>
    </div>
  )
}
