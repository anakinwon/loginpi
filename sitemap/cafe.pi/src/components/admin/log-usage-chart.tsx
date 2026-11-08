'use client'

import { useMemo } from 'react'
import PlotlyPlot from '@/components/charts/plotly-plot'

// 로그성 테이블 용량 사용량 가로 막대 + 임계치 점선.
//   - x: 용량(MB), y: 테이블명(긴 라벨 → 가로 막대 + automargin)
//   - 임계치 초과 막대는 빨강, PURGEABLE은 amber, READONLY는 slate
//   - 임계치는 Plotly shapes의 수직 점선 + annotation으로 표시
//   데이터는 logs 페이지가 이미 조회한 tables를 prop으로 받아 재사용(추가 조회 없음).

interface LogUsageRow {
  tbl: string
  label: string
  category: 'PURGEABLE' | 'READONLY'
  total_bytes: number | null
  exists_yn: boolean
}

const BYTES_PER_MB = 1024 * 1024

// bean-daily-chart와 동일한 중립 폰트색 규약(라이트/다크 양쪽 가독)
const BASE_LAYOUT = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { color: '#94a3b8', size: 11 },
  margin: { l: 8, r: 56, t: 18, b: 36 },
  hovermode: 'closest' as const,
  showlegend: false,
  bargap: 0.35,
  xaxis: {
    title: { text: 'MB', font: { size: 10 } },
    zeroline: false,
    gridcolor: 'rgba(148,163,184,0.15)',
  },
  yaxis: { automargin: true, ticksuffix: '  ' },
}
const COMMON_CONFIG = { displayModeBar: false, responsive: true } as const

export default function LogUsageChart({
  tables,
  thresholdMB,
  emptyText,
}: {
  tables: LogUsageRow[]
  thresholdMB: number
  emptyText: string
}) {
  const { data, layout, isEmpty, plotStyle } = useMemo(() => {
    const rows = tables.filter((t) => t.exists_yn && (t.total_bytes ?? 0) > 0)
    // 가로 막대는 아래→위로 그려지므로, 큰 값이 위로 오도록 오름차순 정렬
    const sorted = [...rows].sort(
      (a, b) => (a.total_bytes ?? 0) - (b.total_bytes ?? 0),
    )
    const yLabels = sorted.map((r) => r.label)
    const xMB = sorted.map((r) => (r.total_bytes ?? 0) / BYTES_PER_MB)
    const colors = sorted.map(
      (r, i) =>
        xMB[i] > thresholdMB
          ? '#ef4444' // red-500 — 임계치 초과
          : r.category === 'PURGEABLE'
            ? '#f59e0b' // amber-500 — 정리 가능
            : '#64748b', // slate-500 — 조회 전용
    )

    const trace = {
      type: 'bar' as const,
      orientation: 'h' as const,
      x: xMB,
      y: yLabels,
      marker: { color: colors },
      text: xMB.map((v) =>
        v >= 1 ? `${v.toFixed(1)} MB` : `${(v * 1024).toFixed(0)} KB`,
      ),
      textposition: 'outside' as const,
      cliponaxis: false,
      hovertemplate: '%{y}<br>%{x:.2f} MB<extra></extra>',
    }

    const layoutObj = {
      ...BASE_LAYOUT,
      shapes: [
        {
          type: 'line' as const,
          xref: 'x' as const,
          yref: 'paper' as const,
          x0: thresholdMB,
          x1: thresholdMB,
          y0: 0,
          y1: 1,
          line: { color: '#ef4444', width: 1.5, dash: 'dash' as const },
        },
      ],
      annotations: [
        {
          xref: 'x' as const,
          yref: 'paper' as const,
          x: thresholdMB,
          y: 1,
          yanchor: 'bottom' as const,
          xanchor: 'center' as const,
          text: `${thresholdMB}MB`,
          showarrow: false,
          font: { color: '#ef4444', size: 10 },
        },
      ],
    }

    // 행 수에 비례한 높이(행당 ~38px, 최소 160)
    const height = Math.max(160, sorted.length * 38 + 56)
    return {
      data: [trace],
      layout: layoutObj,
      isEmpty: sorted.length === 0,
      plotStyle: { width: '100%', height: `${height}px` },
    }
  }, [tables, thresholdMB])

  if (isEmpty) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        {emptyText}
      </p>
    )
  }

  return (
    <PlotlyPlot
      data={data}
      layout={layout}
      config={COMMON_CONFIG}
      style={plotStyle}
      useResizeHandler
    />
  )
}
