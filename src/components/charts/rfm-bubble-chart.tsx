'use client'

import { useMemo } from 'react'
import PlotlyPlot from '@/components/charts/plotly-plot'

// RFM 버블 차트 (Phase 22 §12 ②) — x: 최근성(경과일, 작을수록 최근), y: 구매 횟수,
//   버블 크기: 누적 결제액(π), 색: 세그먼트. 우측(최근)·상단(빈번)·큰 버블 = 핵심 고객.
//   세그먼트 색은 의미 고정(테마색 아님) — bean-daily-chart 선례.

interface Pt {
  recencyDays: number
  freq: number
  monetaryPi: number
  seg: string
  segLabel: string
}

const SEG_COLOR: Record<string, string> = {
  champion: '#22c55e', // green
  loyal: '#14b8a6', // teal
  recent: '#3b82f6', // blue
  potential: '#a78bfa', // violet
  at_risk: '#f59e0b', // amber
  hibernating: '#f43f5e', // rose
}

const BASE_LAYOUT = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { color: '#94a3b8', size: 11 },
  margin: { l: 48, r: 16, t: 10, b: 48 },
  legend: { orientation: 'h' as const, y: -0.25, x: 0 },
  xaxis: {
    title: { text: '최근 구매 경과(일) · 우측일수록 최근' },
    autorange: 'reversed' as const,
    color: '#94a3b8',
    zeroline: false,
  },
  yaxis: { title: { text: '구매 횟수' }, color: '#94a3b8', zeroline: false },
}
const COMMON_CONFIG = { displayModeBar: false, responsive: true } as const
const PLOT_STYLE = { width: '100%', height: '320px' }

export default function RfmBubbleChart({ points }: { points: Pt[] }) {
  const { traces, isEmpty } = useMemo(() => {
    if (points.length === 0) return { traces: [], isEmpty: true }
    const maxM = Math.max(1, ...points.map((p) => p.monetaryPi))
    const bySeg = new Map<string, Pt[]>()
    for (const p of points) {
      const arr = bySeg.get(p.seg) ?? []
      arr.push(p)
      bySeg.set(p.seg, arr)
    }
    const traces = [...bySeg.entries()].map(([seg, pts]) => ({
      type: 'scatter' as const,
      mode: 'markers' as const,
      name: pts[0].segLabel,
      x: pts.map((p) => p.recencyDays),
      y: pts.map((p) => p.freq),
      text: pts.map((p) => `${p.segLabel} · ${p.monetaryPi.toFixed(2)} π`),
      marker: {
        color: SEG_COLOR[seg] ?? '#94a3b8',
        size: pts.map((p) => 8 + Math.sqrt(p.monetaryPi / maxM) * 30),
        sizemode: 'diameter' as const,
        opacity: 0.7,
        line: { width: 1, color: '#ffffff' },
      },
      hovertemplate: '%{text}<br>최근 %{x}일 · %{y}회<extra></extra>',
    }))
    return { traces, isEmpty: false }
  }, [points])

  if (isEmpty)
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        RFM 분석할 완료 주문이 없습니다.
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
