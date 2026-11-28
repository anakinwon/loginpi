'use client'

// PC 도구 현황 그래프 4종(종류별 설치 도넛·사용 상위 가로 막대·일별 사용 추이·훅 이벤트별 실행) — echarts/core 트리셰이킹·SVG 렌더러(dbms.pi echart.tsx 와 같은 방식)
//  대시보드가 next/dynamic(ssr:false)로만 불러온다. 좁은 화면(480px 미만)은 라벨·범례 글자를 줄인다
import { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import {
  KIND_COLOR,
  TOOL_KINDS,
  type Daily,
  type HookUse,
  type ToolKind,
  type UseItem,
} from './types'

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  SVGRenderer,
])

const NARROW_PX = 480
const C = {
  grid: '#222838',
  text: '#a1a1a1',
  ink: '#e5e5e5',
  hook: KIND_COLOR.hook,
}
type Opt = echarts.EChartsCoreOption

const base = (narrow: boolean) => ({
  backgroundColor: 'transparent',
  textStyle: { color: C.text, fontSize: narrow ? 10 : 12 },
  aria: { enabled: true, decal: { show: false } },
  tooltip: {
    backgroundColor: C.grid,
    borderColor: 'rgba(255,255,255,0.1)',
    textStyle: { color: C.ink, fontSize: 12 },
    confine: true,
  },
})
const legend = (narrow: boolean) => ({
  type: 'scroll' as const,
  top: 0,
  icon: 'roundRect',
  itemWidth: 10,
  itemHeight: 8,
  textStyle: { color: C.text, fontSize: narrow ? 10 : 12 },
})
const axisLine = { lineStyle: { color: C.grid } }
const splitLine = { lineStyle: { color: C.grid, type: 'dashed' as const } }

function EChart({
  option,
  label,
  height,
}: {
  option: (narrow: boolean) => Opt
  label: string
  height: number
}) {
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

  return (
    <div role="img" aria-label={label}>
      <div ref={el} className="w-full" style={{ height }} />
    </div>
  )
}

export interface ToolChartsProps {
  installed: Record<ToolKind, number>
  top: UseItem[]
  daily: Daily[]
  hooks: HookUse[]
  kindLabel: (k: ToolKind) => string
  titles: { installed: string; top: string; daily: string; hooks: string }
  emptyText: string
}

function Panel({
  title,
  empty,
  emptyText,
  children,
}: {
  title: string
  empty: boolean
  emptyText: string
  children: React.ReactNode
}) {
  return (
    <section className="tool-panel">
      <h2 className="tool-panel-title">{title}</h2>
      {empty ? (
        <p className="text-muted-foreground flex h-48 items-center justify-center text-sm">
          {emptyText}
        </p>
      ) : (
        children
      )}
    </section>
  )
}

export function ToolCharts({
  installed,
  top,
  daily,
  hooks,
  kindLabel,
  titles,
  emptyText,
}: ToolChartsProps) {
  const total = TOOL_KINDS.reduce((s, k) => s + installed[k], 0)
  // 일별 추이는 훅 제외(훅 실행 수가 수천 단위라 다른 계열을 눌러 버림 — 훅은 별도 그래프)
  const lineKinds = TOOL_KINDS.filter((k) => k !== 'hook')
  const topRev = [...top].reverse() // 가로 막대는 아래에서 위로 그려져 1위를 맨 위에

  const donut = (narrow: boolean): Opt => ({
    ...base(narrow),
    tooltip: { ...base(narrow).tooltip, trigger: 'item' },
    legend: { ...legend(narrow), top: 'bottom' },
    series: [
      {
        type: 'pie',
        radius: narrow ? ['44%', '66%'] : ['48%', '70%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#070a12', borderWidth: 2 },
        label: {
          show: true,
          position: 'center',
          formatter: () => `{n|${total.toLocaleString()}}`,
          rich: {
            n: { fontSize: narrow ? 20 : 26, fontWeight: 700, color: C.ink },
          },
        },
        labelLine: { show: false },
        data: TOOL_KINDS.map((k) => ({
          name: kindLabel(k),
          value: installed[k],
          itemStyle: { color: KIND_COLOR[k] },
        })),
      },
    ],
  })

  const bars = (narrow: boolean): Opt => ({
    ...base(narrow),
    tooltip: {
      ...base(narrow).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
    },
    grid: { left: 8, right: 40, top: 8, bottom: 8, containLabel: true },
    xAxis: {
      type: 'value',
      axisLine,
      splitLine,
      axisLabel: { color: C.text, fontSize: narrow ? 10 : 11 },
    },
    yAxis: {
      type: 'category',
      data: topRev.map((u) => u.name),
      axisLine,
      axisTick: { show: false },
      axisLabel: {
        color: C.ink,
        fontSize: narrow ? 10 : 11,
        width: narrow ? 90 : 160,
        overflow: 'truncate',
      },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 14,
        data: topRev.map((u) => ({
          value: u.calls,
          itemStyle: { color: KIND_COLOR[u.type], borderRadius: [0, 3, 3, 0] },
        })),
        label: {
          show: true,
          position: 'right',
          color: C.text,
          fontSize: 10,
        },
      },
    ],
  })

  const line = (narrow: boolean): Opt => ({
    ...base(narrow),
    tooltip: { ...base(narrow).tooltip, trigger: 'axis' },
    legend: legend(narrow),
    grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      data: daily.map((d) => d.date.slice(5)),
      axisLine,
      axisLabel: { color: C.text, hideOverlap: true, fontSize: narrow ? 10 : 11 },
    },
    yAxis: {
      type: 'value',
      axisLine,
      splitLine,
      axisLabel: { color: C.text, fontSize: narrow ? 10 : 11 },
    },
    series: lineKinds.map((k) => ({
      name: kindLabel(k),
      type: 'line',
      smooth: 0.3,
      symbol: 'circle',
      symbolSize: 4,
      showSymbol: false,
      lineStyle: { width: 2, color: KIND_COLOR[k] },
      itemStyle: { color: KIND_COLOR[k] },
      data: daily.map((d) => d[k]),
    })),
  })

  const hookBars = (narrow: boolean): Opt => ({
    ...base(narrow),
    tooltip: {
      ...base(narrow).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
    },
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      data: hooks.map((h) => h.event),
      axisLine,
      axisTick: { show: false },
      axisLabel: {
        color: C.ink,
        fontSize: narrow ? 9 : 11,
        interval: 0,
        rotate: narrow ? 35 : 0,
      },
    },
    yAxis: {
      type: 'value',
      axisLine,
      splitLine,
      axisLabel: { color: C.text, fontSize: narrow ? 10 : 11 },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 28,
        itemStyle: { color: C.hook, borderRadius: [3, 3, 0, 0] },
        label: { show: true, position: 'top', color: C.text, fontSize: 10 },
        data: hooks.map((h) => h.runs),
      },
    ],
  })

  const hasDaily = daily.some((d) => lineKinds.some((k) => d[k] > 0))
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title={titles.installed} empty={!total} emptyText={emptyText}>
        <EChart option={donut} label={titles.installed} height={280} />
      </Panel>
      <Panel title={titles.top} empty={!top.length} emptyText={emptyText}>
        <EChart
          option={bars}
          label={titles.top}
          height={Math.max(200, top.length * 22 + 24)}
        />
      </Panel>
      <Panel title={titles.daily} empty={!hasDaily} emptyText={emptyText}>
        <EChart option={line} label={titles.daily} height={280} />
      </Panel>
      <Panel title={titles.hooks} empty={!hooks.length} emptyText={emptyText}>
        <EChart option={hookBars} label={titles.hooks} height={280} />
      </Panel>
    </div>
  )
}
