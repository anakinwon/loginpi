'use client'

import { useMemo } from 'react'
import PlotlyPlot from '@/components/charts/plotly-plot'

// 구독관리 통계 차트 — bean_subscr 데이터를 3개 차원으로 시각화.
//   ① 상품군별 구독 건수(도넛) ② 상품군별 Bean 매출(가로 막대) ③ 결제주기 분포(스택 막대)
// 데이터량이 적어 별도 집계 API 없이 클라이언트에서 받은 행을 그대로 집계한다.

type SubscrProduct = 'PICAFE' | 'PISHOP' | 'TRANSLATE'
type SubscrCycle = 'M' | 'Y'

export interface SubscrChartRow {
  prod_ctgr_cd: SubscrProduct
  bill_cycle_cd: SubscrCycle
  bean_amt: number
  start_dtm: string
}

const PRODUCTS: SubscrProduct[] = ['PICAFE', 'PISHOP', 'TRANSLATE']
const PRODUCT_LABEL: Record<SubscrProduct, string> = {
  PICAFE: 'PiCafé™',
  PISHOP: 'PiShop™',
  TRANSLATE: '번역',
}
// Plotly는 hex 색이 필요(tailwind 클래스 불가). page.tsx 뱃지 색과 동일 계열.
const PRODUCT_HEX: Record<SubscrProduct, string> = {
  PICAFE: '#f59e0b', // amber-500
  PISHOP: '#3b82f6', // blue-500
  TRANSLATE: '#a855f7', // purple-500
}
const CYCLE_HEX: Record<SubscrCycle, string> = {
  M: '#60a5fa', // 월간 — blue-400
  Y: '#34d399', // 연간 — emerald-400
}

// 모든 차트 공통 레이아웃 — 라이트/다크 양쪽에서 보이는 중립 폰트색.
const BASE_LAYOUT = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { color: '#94a3b8', size: 11 },
  margin: { l: 16, r: 16, t: 10, b: 16 },
}
const COMMON_CONFIG = { displayModeBar: false, responsive: true } as const
const PLOT_STYLE = { width: '100%', height: '280px' }

function ChartBox({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="mb-2 text-sm font-medium">{title}</p>
      {children}
    </div>
  )
}

export default function SubscrStatsCharts({
  rows,
}: {
  rows: SubscrChartRow[]
}) {
  // 상품군별 건수·매출 합산 + 누적 시계열
  const { countByProduct, revByProduct, cycleByProduct, timeline } = useMemo(() => {
    const count: Record<SubscrProduct, number> = {
      PICAFE: 0,
      PISHOP: 0,
      TRANSLATE: 0,
    }
    const rev: Record<SubscrProduct, number> = {
      PICAFE: 0,
      PISHOP: 0,
      TRANSLATE: 0,
    }
    // [상품군][주기] 건수
    const cycle: Record<SubscrProduct, Record<SubscrCycle, number>> = {
      PICAFE: { M: 0, Y: 0 },
      PISHOP: { M: 0, Y: 0 },
      TRANSLATE: { M: 0, Y: 0 },
    }
    // 시계열: [상품군][날짜(YYYY-MM-DD)] 신규 건수
    const dailyNew: Record<SubscrProduct, Record<string, number>> = {
      PICAFE: {},
      PISHOP: {},
      TRANSLATE: {},
    }
    const dateSet = new Set<string>()

    for (const r of rows) {
      if (!PRODUCTS.includes(r.prod_ctgr_cd)) continue
      count[r.prod_ctgr_cd] += 1
      rev[r.prod_ctgr_cd] += r.bean_amt > 0 ? r.bean_amt : 0
      const c: SubscrCycle = r.bill_cycle_cd === 'Y' ? 'Y' : 'M'
      cycle[r.prod_ctgr_cd][c] += 1

      const day = r.start_dtm?.slice(0, 10)
      if (day) {
        dailyNew[r.prod_ctgr_cd][day] =
          (dailyNew[r.prod_ctgr_cd][day] ?? 0) + 1
        dateSet.add(day)
      }
    }

    // 공통 날짜축(오름차순)에서 상품군별 누적합 계산 → 멀티라인 정렬
    const dates = [...dateSet].sort()
    const cumByProduct: Record<SubscrProduct, number[]> = {
      PICAFE: [],
      PISHOP: [],
      TRANSLATE: [],
    }
    for (const p of PRODUCTS) {
      let running = 0
      cumByProduct[p] = dates.map((d) => {
        running += dailyNew[p][d] ?? 0
        return running
      })
    }

    return {
      countByProduct: count,
      revByProduct: rev,
      cycleByProduct: cycle,
      timeline: { dates, cumByProduct },
    }
  }, [rows])

  if (rows.length === 0) return null

  // ① 상품군별 구독 건수 — 도넛
  const donutTrace = [
    {
      type: 'pie' as const,
      hole: 0.55,
      labels: PRODUCTS.map((p) => PRODUCT_LABEL[p]),
      values: PRODUCTS.map((p) => countByProduct[p]),
      marker: { colors: PRODUCTS.map((p) => PRODUCT_HEX[p]) },
      textinfo: 'value+percent' as const,
      hovertemplate: '%{label}<br>%{value}건<br>%{percent}<extra></extra>',
    },
  ]

  // ② 상품군별 Bean 매출 — 가로 막대 (매출 오름차순 → 큰 값이 위로)
  const revSorted = [...PRODUCTS].sort(
    (a, b) => revByProduct[a] - revByProduct[b],
  )
  const revBarTrace = [
    {
      type: 'bar' as const,
      orientation: 'h' as const,
      x: revSorted.map((p) => revByProduct[p]),
      y: revSorted.map((p) => PRODUCT_LABEL[p]),
      marker: { color: revSorted.map((p) => PRODUCT_HEX[p]) },
      text: revSorted.map((p) => revByProduct[p].toLocaleString()),
      textposition: 'auto' as const,
      hovertemplate: '%{y}<br>%{x:,} Bean<extra></extra>',
    },
  ]

  // ③ 결제주기 분포 — 스택 세로 막대 (상품군 x축, 월간/연간 누적)
  const cycleTraces = (['M', 'Y'] as SubscrCycle[]).map((c) => ({
    type: 'bar' as const,
    name: c === 'M' ? '월간' : '연간',
    x: PRODUCTS.map((p) => PRODUCT_LABEL[p]),
    y: PRODUCTS.map((p) => cycleByProduct[p][c]),
    marker: { color: CYCLE_HEX[c] },
    hovertemplate: '%{x} ' + (c === 'M' ? '월간' : '연간') + '<br>%{y}건<extra></extra>',
  }))

  // ④ 상품군별 누적 구독 추이 — 다중 라인(시계열)
  const timelineTraces = PRODUCTS.map((p) => ({
    type: 'scatter' as const,
    mode: 'lines+markers' as const,
    name: PRODUCT_LABEL[p],
    x: timeline.dates,
    y: timeline.cumByProduct[p],
    line: {
      color: PRODUCT_HEX[p],
      width: 2.5,
      shape: 'spline' as const,
      smoothing: 1.3,
    },
    marker: { size: 6, color: PRODUCT_HEX[p] },
    hovertemplate: '%{x}<br>' + PRODUCT_LABEL[p] + ' 누적 %{y}건<extra></extra>',
  }))

  return (
    <div className="space-y-4">
      {/* ④ 누적 구독 추이 — 풀폭 다중 라인 (성장세) */}
      <ChartBox title="상품군별 누적 구독 추이">
        <PlotlyPlot
          data={timelineTraces}
          layout={{
            ...BASE_LAYOUT,
            margin: { l: 40, r: 16, t: 10, b: 48 },
            xaxis: {
              // 날짜 문자열을 카테고리로 취급 → 시:분 분할 없이 날짜 단위로만 표시
              type: 'category',
              gridcolor: 'rgba(148,163,184,0.15)',
              zeroline: false,
              tickangle: -45,
            },
            yaxis: {
              gridcolor: 'rgba(148,163,184,0.15)',
              zeroline: false,
              rangemode: 'tozero',
              dtick: 1,
            },
            legend: { orientation: 'h', y: -0.2 },
          }}
          style={{ width: '100%', height: '300px' }}
          useResizeHandler
          config={COMMON_CONFIG}
        />
      </ChartBox>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <ChartBox title="상품군별 구독 건수">
        <PlotlyPlot
          data={donutTrace}
          layout={{
            ...BASE_LAYOUT,
            legend: { orientation: 'h', y: -0.1 },
          }}
          style={PLOT_STYLE}
          useResizeHandler
          config={COMMON_CONFIG}
        />
      </ChartBox>

      <ChartBox title="상품군별 Bean 매출">
        <PlotlyPlot
          data={revBarTrace}
          layout={{
            ...BASE_LAYOUT,
            margin: { l: 64, r: 16, t: 10, b: 24 },
            xaxis: { gridcolor: 'rgba(148,163,184,0.15)', zeroline: false },
            yaxis: { automargin: true },
          }}
          style={PLOT_STYLE}
          useResizeHandler
          config={COMMON_CONFIG}
        />
      </ChartBox>

      <ChartBox title="결제주기 분포 (월간·연간)">
        <PlotlyPlot
          data={cycleTraces}
          layout={{
            ...BASE_LAYOUT,
            barmode: 'stack',
            margin: { l: 32, r: 16, t: 10, b: 24 },
            xaxis: { zeroline: false },
            yaxis: {
              gridcolor: 'rgba(148,163,184,0.15)',
              zeroline: false,
              dtick: 1,
            },
            legend: { orientation: 'h', y: -0.18 },
          }}
          style={PLOT_STYLE}
          useResizeHandler
          config={COMMON_CONFIG}
        />
      </ChartBox>
      </div>
    </div>
  )
}
