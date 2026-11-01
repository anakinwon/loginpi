'use client'

// ECharts 얇은 래퍼 — echarts/core 트리셰이킹(쓰는 차트·컴포넌트만 등록), SVG 렌더러, ResizeObserver 로 크기·narrow(480px 미만) 재계산, 언마운트 dispose
//  option 은 (narrow) => option 함수로 받아 좁은 화면에서 범례·축 라벨을 줄인다. echarts-for-react 미사용. 모니터 화면이 next/dynamic(ssr:false)로만 불러온다
import { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts/core'
import {
  BarChart,
  GaugeChart,
  HeatmapChart,
  LineChart,
  PieChart,
} from 'echarts/charts'
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapPiecewiseComponent,
} from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import { NARROW_PX } from './theme'

echarts.use([
  BarChart,
  GaugeChart,
  HeatmapChart,
  LineChart,
  PieChart,
  AriaComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapPiecewiseComponent,
  SVGRenderer,
])

export type ChartOption = echarts.EChartsCoreOption
export type EChartProps = {
  option: (narrow: boolean) => ChartOption
  ariaLabel: string
  height?: number
  className?: string
}

export function EChart({
  option,
  ariaLabel,
  height = 240,
  className,
}: EChartProps) {
  const el = useRef<HTMLDivElement>(null)
  const inst = useRef<echarts.ECharts | null>(null)
  const [narrow, setNarrow] = useState(false)

  useEffect(() => {
    const node = el.current
    if (!node) return
    const chart = echarts.init(node, null, { renderer: 'svg' })
    inst.current = chart
    const ro = new ResizeObserver(([e]) => {
      setNarrow(e.contentRect.width < NARROW_PX)
      chart.resize()
    })
    ro.observe(node)
    return () => {
      ro.disconnect()
      chart.dispose()
      inst.current = null
    }
  }, [])

  useEffect(() => {
    inst.current?.setOption(option(narrow), { notMerge: true })
  }, [option, narrow])

  // aria-label 은 바깥 div — ECharts aria 가 안쪽 div 에 자동 설명을 단다
  return (
    <div role="img" aria-label={ariaLabel} className={className}>
      <div ref={el} className="w-full" style={{ height }} />
    </div>
  )
}
