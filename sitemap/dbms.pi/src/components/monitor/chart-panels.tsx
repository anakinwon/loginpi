'use client'

// 모니터링 보드 차트 영역(ECharts) — 모니터 화면이 next/dynamic(ssr:false)로만 불러와 첫 화면 번들에서 빠진다. 화면에 들어오기 직전(rootMargin 200px)에만 이력 조회
//  P1 게이지(연결·캐시) · P2 도넛(세션 상태) · P3 누적 막대+선(세션 추이·락 대기, 한 축) · P4 처리량/롤백 위아래 2단(이중 축 대신) · P5 캐시 적중률 선 · P6 용량 영역+예측 점선
//  · P7 느린 SQL TOP10 · P8 공간 TOP10 누적 막대 · P9 신호×시간 히트맵 · R 영역별 건강 레이더 · F 앱→계정→상태 산키 · T 스키마·테이블 트리맵. 퍼널은 전환 데이터가 없어 쓰지 않는다. 모든 패널은 질문 한 줄 + '표로 보기' 동반
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { EChart, type ChartOption } from '@/components/charts/echart'
import {
  axisLine,
  base,
  C,
  SERIES,
  short,
  splitLine,
  timeAxis,
  valAxis,
} from '@/components/charts/theme'
import { BTN } from '@/components/ui'
import { readApi } from '@/lib/client-api'
import { PERIODS, type PeriodMin } from '@/lib/monitor/rules'
import {
  deltas,
  gaugeScale,
  levelsByBucket,
  RADAR_SAFE,
  radarScores,
  rowLevels,
  sigLevels,
  THR,
  type BoardFast,
  type BoardSlow,
  type FlowNode,
  type HistoryRes,
  type Lvl,
  type SigId,
  type Signal,
  type SnapRow,
  type TreeNode,
} from '@/lib/monitor/signals'
import {
  CopyBtn,
  fmtBytes,
  SQL_CHECK,
  useSigText,
  type Sel,
} from './signal-grid'

const HIST_MS = 5 * 60_000
// 추이 선 끊김 기준(스냅샷 간격이 이보다 길면 화면을 닫아 둔 공백 — 보간하지 않고 null) · 막대 → 누적 영역 전환 점 수(폭 300px 기준 막대 2px 미만)
const GAP_MS = 10 * 60_000
const DENSE_PTS = 120
const GB = 1024 ** 3
const r1 = (v: number) => Math.round(v * 10) / 10
const hhmm = (t: number) =>
  new Date(t).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
const LVL_IDX: Record<Lvl, number> = {
  NA: 0,
  OK: 1,
  UNKNOWN: 2,
  WARN: 3,
  RISK: 4,
}
const LVL_MARK = ['–', '✓', '?', '▲', '✕']
const LVL_COLOR = [C.na, C.ok, C.unknown, C.warn, C.risk]
const mark = (l: Lvl) => LVL_MARK[LVL_IDX[l]]
const lvlColor = (l: Lvl) => LVL_COLOR[LVL_IDX[l]]
// 툴팁은 HTML — 앱·계정·테이블 이름(사용자 입력)을 그대로 넣지 않는다
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// '#rrggbb' → rgba (그라데이션 면)
const rgba = (hex: string, a: number) =>
  `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',')},${a})`

// 시계열 공백 구간에 null 점을 끼워 선·영역이 빈 시간을 잇지 않게 한다
const withGaps = (arr: [number, number][]): [number, number | null][] =>
  arr.flatMap((p, i): [number, number | null][] =>
    i > 0 && p[0] - arr[i - 1][0] > GAP_MS
      ? [[arr[i - 1][0] + 60_000, null], p]
      : [p],
  )

function useOnVisible<T extends Element>() {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && setSeen(true),
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  return { ref, seen }
}

type Props = {
  sel: Sel
  fast: BoardFast | null
  slow: BoardSlow | null
  // 카드와 같은 판정(AVAIL TIMEOUT 승격 반영) — monitor-view 가 합친 Map
  signals: Map<SigId, Signal>
}

export default function ChartPanels({ sel, fast, slow, signals }: Props) {
  const t = useTranslations('monitor')
  const { ref, seen } = useOnVisible<HTMLElement>()
  const [range, setRange] = useState<PeriodMin>(60)
  const [hist, setHist] = useState<{ key: string; rows: SnapRow[] } | null>(
    null,
  )
  const key = `${sel.linkId}:${sel.connId}:${range}`

  const load = useCallback(async () => {
    if (!sel.connId) return
    const r = await readApi<HistoryRes>(
      piFetch(
        `/api/monitor/history?link=${encodeURIComponent(sel.linkId)}&conn=${encodeURIComponent(sel.connId)}&range=${range}`,
      ),
    )
    if (r.ok) setHist({ key, rows: r.data.rows })
  }, [sel.linkId, sel.connId, range, key])

  useEffect(() => {
    if (!seen) return
    void load()
    const id = setInterval(() => !document.hidden && void load(), HIST_MS)
    return () => clearInterval(id)
  }, [seen, load])

  const rows = hist?.key === key ? hist.rows : null

  return (
    <section
      ref={ref}
      className="space-y-3"
      aria-label={t('board.chart.title')}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">{t('board.chart.title')}</h2>
        <div
          role="group"
          aria-label={t('period')}
          className="flex flex-wrap gap-1"
        >
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              className={`${BTN} ${p === range ? 'ring-accent ring-2' : ''}`}
              aria-pressed={p === range}
              onClick={() => setRange(p)}
            >
              {t(`periods.${p}`)}
            </button>
          ))}
        </div>
      </div>
      <p className="text-muted-foreground text-xs break-keep">
        {t('board.chart.note')}
      </p>
      {seen && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {signals.size > 0 && (
            <Radar signals={signals} rows={rows} range={range} />
          )}
          {signals.size > 0 && <Gauges signals={signals} />}
          {fast && <SessDonut fast={fast} />}
          {fast && <Flow fast={fast} />}
          <SessTrend rows={rows} />
          <TpsCombo rows={rows} />
          <CacheTrend rows={rows} />
          <Capacity slow={slow} rows={rows} />
          <SlowTop slow={slow} />
          <SizeTop slow={slow} />
          <SizeTreemap slow={slow} />
          <Heat rows={rows} range={range} />
        </div>
      )}
    </section>
  )
}

// ── 패널 틀 : 제목·질문·차트·표로 보기 ──
function Panel({
  id,
  children,
  table,
  wide,
}: {
  id: string
  children: React.ReactNode
  table?: React.ReactNode
  wide?: boolean
}) {
  const t = useTranslations('monitor.board.chart')
  return (
    <figure
      className={`bg-surface min-w-0 space-y-2 rounded-2xl p-4 ${wide ? 'md:col-span-2 xl:col-span-3' : ''}`}
    >
      <figcaption>
        <h3 className="font-semibold">{t(id)}</h3>
        <p className="text-muted-foreground text-xs break-keep">
          {t(`q.${id}`)}
        </p>
      </figcaption>
      {children}
      {table && (
        <details className="text-xs">
          <summary className="text-accent cursor-pointer">
            {t('asTable')}
          </summary>
          <div className="mt-2 max-h-64 overflow-auto">{table}</div>
        </details>
      )}
    </figure>
  )
}
function Empty({ k }: { k: string }) {
  const t = useTranslations('monitor.board.chart')
  return (
    <p className="text-muted-foreground grid h-40 place-items-center text-center text-sm break-keep">
      {t(k)}
    </p>
  )
}
function Table({
  head,
  rows,
}: {
  head: string[]
  rows: (string | number)[][]
}) {
  return (
    <table className="w-full text-left tabular-nums">
      <thead className="text-muted-foreground">
        <tr>
          {head.map((h) => (
            <th key={h} className="py-1 pr-2 font-normal">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-white/5">
            {r.map((c, j) => (
              <td key={j} className="py-1 pr-2 break-all">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
const dash = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v

// 게이지 눈금 칸 수 — 범위가 10 이하 정수면 1단위 칸(정수 눈금), 아니면 5칸
function gaugeSplit(sc: { min: number; max: number } | null): number {
  const span = sc ? sc.max - sc.min : 100
  return span > 0 && span <= 10 && Number.isInteger(span) ? span : 5
}

// P1 — 한계 게이지(속도계 2×2) : 연결·캐시·응답·저장. 색 띠 = gaugeScale(Signal.thr) = 카드 판정과 같은 THR 구간
const GAUGE_IDS = ['CONN_USE', 'CACHE_HIT', 'AVAIL', 'STORAGE'] as const
const GAUGE_POS = [
  ['25%', '28%'],
  ['75%', '28%'],
  ['25%', '76%'],
  ['75%', '76%'],
]
const unitTxt = (u: Signal['unit']) =>
  u === 'pct' ? '%' : u === 'ms' ? ' ms' : ''

function Gauges({ signals }: { signals: Map<SigId, Signal> }) {
  const t = useTranslations('monitor.board')
  const items = useMemo(
    () =>
      GAUGE_IDS.map((id) => {
        const s = signals.get(id)
        // 저장은 한도 규칙이 있을 때(unit pct)만 바늘 — 없으면 회색 띠·'—'·한도 없음 안내
        const sc =
          s?.thr &&
          s.value !== null &&
          s.lvl !== 'UNKNOWN' &&
          (id !== 'STORAGE' || s.unit === 'pct')
            ? gaugeScale(s.thr, s.unit)
            : null
        return {
          id,
          s,
          sc,
          lvl: s?.lvl ?? ('UNKNOWN' as Lvl),
          name: id === 'AVAIL' ? t('chart.rsp') : t(`sig.${id}`),
          noLimit: id === 'STORAGE' && s?.reason === 'NO_LIMIT',
          txt:
            sc && s ? `${s.value}${unitTxt(s.unit)}` : ('—' as string | number),
        }
      }),
    [signals, t],
  )
  const opt = useCallback(
    (narrow: boolean): ChartOption => ({
      ...base(narrow),
      tooltip: { show: false },
      series: items.map((g, i) => ({
        type: 'gauge',
        center: GAUGE_POS[i],
        radius: narrow ? '36%' : '40%',
        startAngle: 225,
        endAngle: -45,
        min: g.sc?.min ?? 0,
        max: g.sc?.max ?? 100,
        // 눈금 간격을 정수로 — 폭 10 이하(캐시 91~100)는 1포인트 간격이라 판정 경계(95)와 눈금 글자가 같은 자리
        splitNumber: gaugeSplit(g.sc),
        axisLine: {
          lineStyle: {
            width: 12,
            color: g.sc
              ? g.sc.stops.map(([p, l]) => [p, lvlColor(l)])
              : [[1, C.unknown]],
          },
        },
        axisTick: { length: 4, lineStyle: { color: C.text } }, // 어두운 면 위 눈금 대비(C.grid 는 1.2:1)
        splitLine: { length: 10, lineStyle: { color: C.ink, width: 2 } },
        axisLabel: {
          show: !narrow,
          color: C.text,
          fontSize: 9,
          distance: 16,
          // 정수 간격이면 정수 그대로, 아니면 소수 1자리(반올림으로 위치와 글자가 어긋나지 않게)
          formatter: (v: number) =>
            Number.isInteger(v) ? String(v) : v.toFixed(1),
        },
        pointer: { show: !!g.sc, width: 4, itemStyle: { color: C.ink } },
        anchor: {
          show: !!g.sc,
          size: 8,
          itemStyle: { color: C.ink },
        },
        title: {
          color: C.text,
          fontSize: narrow ? 10 : 11,
          offsetCenter: [0, '78%'],
        },
        detail: {
          color: C.ink,
          fontSize: narrow ? 13 : 16,
          fontWeight: 700,
          offsetCenter: [0, '42%'],
          formatter: () => String(g.txt),
        },
        data: [
          {
            // 바늘은 [min,max] 로 자르고 글자는 실제 값
            value: g.sc
              ? Math.min(g.sc.max, Math.max(g.sc.min, g.s!.value!))
              : 0,
            name: `${g.name} ${mark(g.lvl)}${g.noLimit ? `\n${t('chart.gaugeNoLimit')}` : ''}`,
          },
        ],
      })),
    }),
    [items, t],
  )
  return (
    <Panel
      id="gauges"
      table={
        <Table
          head={[
            t('chart.col.item'),
            t('chart.col.value'),
            t('chart.col.level'),
            t('chart.col.thr'),
          ]}
          rows={items.map((g) => [
            g.name,
            g.txt,
            `${mark(g.lvl)} ${t(`level.${g.lvl}`)}`,
            g.s?.thr
              ? `▲ ${g.s.thr.warn}${unitTxt(g.s.unit)} · ✕ ${g.s.thr.risk}${unitTxt(g.s.unit)}`
              : '—',
          ])}
        />
      }
    >
      <EChart
        option={opt}
        height={(narrow) => (narrow ? 320 : 360)}
        ariaLabel={`${t('chart.gauges')} : ${items.map((g) => `${g.name} ${g.txt}`).join(', ')}`}
      />
    </Panel>
  )
}

// R — 영역별 건강 점수 레이더(8축) : 현재 vs 안전 기준선(점선·사각 마커). '1시간 전'은 스냅샷 4축뿐이라 표 열로만
function Radar({
  signals,
  rows,
  range,
}: {
  signals: Map<SigId, Signal>
  rows: SnapRow[] | null
  range: PeriodMin
}) {
  const t = useTranslations('monitor.board')
  const cur = useMemo(() => radarScores(sigLevels(signals.values())), [signals])
  const ago = useMemo(() => {
    if (range < 60 || !rows || rows.length < 2) return null
    // 기준 '지금' = 마지막 스냅샷 시각(렌더 중 Date.now 회피 — 이력은 5분마다 새로 받음)
    const target = Date.parse(rows[rows.length - 1].bkt_dtm) - 3_600_000
    let k = -1
    let best = 5 * 60_000
    rows.forEach((r, i) => {
      const d = Math.abs(Date.parse(r.bkt_dtm) - target)
      if (d <= best) {
        best = d
        k = i
      }
    })
    return k < 0 ? null : radarScores(rowLevels(rows[k - 1], rows[k]))
  }, [rows, range])
  const axisNm = useCallback(
    (a: string) => t(`chart.axis.${a}` as 'chart.axis.avail'),
    [t],
  )
  // option 이 렌더마다 새로 만들어지지 않게(setOption 반복 방지) 메모
  const shown = useMemo(() => cur.filter((p) => p.score !== null), [cur])
  const out = useMemo(() => cur.filter((p) => p.score === null), [cur])
  const opt = useCallback(
    (narrow: boolean): ChartOption => {
      const marks = new Map(shown.map((p) => [axisNm(p.axis), mark(p.lvl)]))
      return {
        ...base(narrow),
        legend: {
          ...base(narrow).legend,
          data: [t('chart.radarCur'), t('chart.radarSafe')],
        },
        tooltip: { ...base(narrow).tooltip, trigger: 'item' },
        radar: {
          shape: 'polygon',
          center: ['50%', '56%'],
          radius: narrow ? '42%' : '65%',
          splitNumber: 5,
          splitLine: { lineStyle: { color: 'rgba(137,135,129,0.35)' } }, // 다각형 고리 보이게
          splitArea: { show: false },
          axisLine: { lineStyle: { color: 'rgba(137,135,129,0.35)' } },
          // 축 이름 = 어두운 배지 + 판정 글자(색 외 구분)
          axisName: {
            color: C.ink,
            backgroundColor: C.grid,
            borderRadius: 3,
            padding: [3, 5],
            fontSize: narrow ? 10 : 11,
            // 좁은 화면 : 긴 축 이름(en 등)은 2줄로 접어 배지가 잘리지 않게
            ...(narrow ? { width: 70, overflow: 'break' as const } : {}),
            formatter: (v: string) => `${v} ${marks.get(v) ?? ''}`,
          },
          indicator: shown.map((p) => ({ name: axisNm(p.axis), max: 100 })),
        },
        series: [
          {
            type: 'radar',
            data: [
              {
                name: t('chart.radarCur'),
                value: shown.map((p) => p.score),
                symbol: 'circle',
                symbolSize: 8,
                lineStyle: { width: 2, color: SERIES[0] },
                itemStyle: { color: SERIES[0] },
                areaStyle: {
                  color: {
                    type: 'radial',
                    x: 0.5,
                    y: 0.5,
                    r: 0.5,
                    colorStops: [
                      { offset: 0, color: rgba(SERIES[0], 0.45) },
                      { offset: 1, color: rgba(SERIES[0], 0.05) },
                    ],
                  },
                },
              },
              {
                name: t('chart.radarSafe'),
                value: shown.map(() => RADAR_SAFE),
                symbol: 'rect',
                symbolSize: 6,
                lineStyle: { width: 1.5, type: 'dashed', color: C.gray },
                itemStyle: { color: C.gray },
              },
            ],
          },
        ],
      }
    },
    [shown, axisNm, t],
  )
  return (
    <Panel
      id="radar"
      table={
        <Table
          head={[
            t('chart.col.item'),
            t('chart.col.score'),
            t('chart.col.level'),
            t('chart.col.ago'),
          ]}
          rows={cur.map((p, i) => [
            axisNm(p.axis),
            dash(p.score),
            `${mark(p.lvl)} ${t(`level.${p.lvl}`)}`,
            dash(ago?.[i].score),
          ])}
        />
      }
    >
      {shown.length < 3 ? (
        <Empty k="noData" />
      ) : (
        <EChart
          option={opt}
          height={300}
          ariaLabel={`${t('chart.radar')} : ${shown.map((p) => `${axisNm(p.axis)} ${p.score}`).join(', ')}`}
        />
      )}
      {out.length > 0 && (
        <p className="text-muted-foreground text-xs break-keep">
          {t('chart.radarOut', {
            list: out.map((p) => axisNm(p.axis)).join(' · '),
          })}
        </p>
      )}
    </Panel>
  )
}

// F — 앱 → 계정 → 세션 상태 산키(그라데이션 연결선, 마우스를 올리면 인접 강조). 쿼리문·pid·주소는 없음(A3)
const FLOW_STATE_COLOR: Record<string, string> = {
  lockWait: C.risk,
  idleTx: C.warn,
  active: C.blue,
  idle: C.gray,
}
function Flow({ fast }: { fast: BoardFast }) {
  const t = useTranslations('monitor.board.chart')
  const f = fast.flow
  const disp = useMemo(() => {
    const m = new Map<string, string>()
    for (const n of f?.nodes ?? [])
      m.set(
        n.id,
        n.fold !== undefined
          ? t('otherN', { n: n.fold })
          : n.kind === 'state'
            ? t(`flowState.${n.label}` as 'flowState.idle')
            : n.label === ''
              ? t('noApp')
              : n.label,
      )
    return m
  }, [f, t])
  const nm = useCallback((id: string) => disp.get(id) ?? id, [disp])
  const color = (n: FlowNode) =>
    n.kind === 'app'
      ? SERIES[0]
      : n.kind === 'user'
        ? SERIES[2]
        : FLOW_STATE_COLOR[n.label]
  const height = useMemo(() => {
    const per = { app: 0, user: 0, state: 0 }
    for (const n of f?.nodes ?? []) per[n.kind]++
    return Math.min(480, Math.max(240, Math.max(...Object.values(per)) * 24))
  }, [f])
  const opt = useCallback(
    (narrow: boolean): ChartOption => ({
      ...base(narrow),
      tooltip: {
        ...base(narrow).tooltip,
        trigger: 'item',
        formatter: (p: {
          dataType: string
          name: string
          value: number
          data: { source?: string; target?: string }
        }) =>
          p.dataType === 'edge'
            ? `${esc(nm(p.data.source!))} → ${esc(nm(p.data.target!))} : ${p.value} ${t('col.sessions')}`
            : `${esc(nm(p.name))} : ${p.value}`,
      },
      series: [
        {
          type: 'sankey',
          left: 8,
          top: 8,
          bottom: 8,
          right: narrow ? 64 : 110,
          layoutIterations: 32,
          nodeAlign: 'justify',
          nodeWidth: narrow ? 8 : 12,
          nodeGap: narrow ? 6 : 10,
          data: (f?.nodes ?? []).map((n) => ({
            name: n.id,
            itemStyle: { color: color(n) },
            // 상태(마지막 열) 이름은 노드 왼쪽 안쪽에 — 오른쪽 여백 밖으로 잘림 방지
            ...(n.kind === 'state' ? { label: { position: 'left' } } : {}),
          })),
          links: f?.links ?? [],
          lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.35 },
          emphasis: { focus: 'adjacency', lineStyle: { opacity: 0.7 } },
          itemStyle: { borderColor: C.surface, borderWidth: 2 },
          label: {
            color: C.ink,
            fontSize: narrow ? 9 : 11,
            formatter: (p: { name: string }) => short(nm(p.name), narrow),
          },
        },
      ],
    }),
    [f, nm, t],
  )
  const links = useMemo(
    () => [...(f?.links ?? [])].sort((a, b) => b.value - a.value),
    [f],
  )
  return (
    <Panel
      id="flow"
      wide
      table={
        links.length > 0 && (
          <Table
            head={[t('col.from'), t('col.to'), t('col.sessions')]}
            rows={links.map((l) => [nm(l.source), nm(l.target), l.value])}
          />
        )
      }
    >
      {!f || f.nodes.length === 0 ? (
        <Empty k="noSess" />
      ) : (
        <EChart
          option={opt}
          height={height}
          ariaLabel={`${t('flow')} : ${links
            .slice(0, 5)
            .map((l) => `${nm(l.source)} → ${nm(l.target)} ${l.value}`)
            .join(', ')}`}
        />
      )}
      {f?.partial && (
        <p className="text-muted-foreground text-xs">{t('partial')}</p>
      )}
    </Panel>
  )
}

// T — 스키마 → 테이블 용량 지도(면적 = 총 크기, 색 = 죽은 행 판정 = VACUUM 카드와 같은 rateDead). 스키마를 누르면 테이블로
const TREE_LVLS: Lvl[] = ['OK', 'WARN', 'RISK', 'NA']
function SizeTreemap({ slow }: { slow: BoardSlow | null }) {
  const t = useTranslations('monitor.board')
  const tree = slow?.tree
  const label = useCallback(
    (n: TreeNode, top: boolean) =>
      n.name === '__other'
        ? t(top ? 'chart.otherSchema' : 'chart.otherN', { n: n.fold ?? 0 })
        : n.name,
    [t],
  )
  const data = useMemo(() => {
    const map = (n: TreeNode, top: boolean): Record<string, unknown> => ({
      name: label(n, top),
      value: n.value,
      deadPct: n.deadPct,
      lvl: n.lvl,
      // 정상(초록)·주의(노랑) 칸은 흰 글자 대비가 4.5:1 미만이라 어두운 글자, 위험·해당 없음만 흰 글자
      itemStyle: { color: lvlColor(n.lvl) },
      label: { color: n.lvl === 'OK' || n.lvl === 'WARN' ? '#0b0d14' : '#fff' },
      ...(n.children?.length
        ? { children: n.children.map((c) => map(c, false)) }
        : {}),
    })
    return (tree?.nodes ?? []).map((n) => map(n, true))
  }, [tree, label])
  const opt = useCallback(
    (narrow: boolean): ChartOption => ({
      ...base(narrow),
      tooltip: {
        ...base(narrow).tooltip,
        trigger: 'item',
        formatter: (p: {
          value: number
          data: { deadPct: number | null; lvl: Lvl }
          treePathInfo: { name: string }[]
        }) =>
          `${esc(
            p.treePathInfo
              .map((x) => x.name)
              .filter(Boolean)
              .join(' / '),
          )}<br/>${fmtBytes(p.value)} · ${t('chart.deadPct')} ${p.data.deadPct === null ? '—' : `${p.data.deadPct}%`}<br/>${mark(p.data.lvl)} ${t(`level.${p.data.lvl}`)}`,
      },
      series: [
        {
          type: 'treemap',
          top: 8,
          left: 0,
          right: 0,
          bottom: 28,
          roam: false,
          nodeClick: 'zoomToNode',
          // 스키마가 1개(대부분 public)면 첫 화면부터 테이블까지 — 한 덩어리 단색 방지
          leafDepth: data.length === 1 ? 2 : 1,
          visibleMin: 300,
          breadcrumb: {
            show: true,
            bottom: 0,
            itemStyle: { color: C.grid, textStyle: { color: C.ink } },
          },
          levels: [
            {
              itemStyle: {
                borderColor: C.surface,
                borderWidth: 2,
                gapWidth: 2,
              },
              upperLabel: { show: true, height: 18, color: C.ink },
            },
            { itemStyle: { gapWidth: 2, borderColor: C.surface } },
          ],
          label: {
            fontSize: narrow ? 9 : 11,
            // 판정 기호(✓▲✕–)를 칸에도 표시 — 색만으로 구분하지 않게(색각 이상·터치 사용자)
            formatter: (p: {
              name: string
              value: number
              data: { lvl: Lvl }
            }) =>
              `${mark(p.data.lvl)} ${short(p.name, narrow)}\n${fmtBytes(p.value)}`,
          },
          data,
        },
      ],
    }),
    [data, t],
  )
  const rowsT = useMemo(
    () =>
      (tree?.nodes ?? []).flatMap((s) =>
        (s.children?.length ? s.children : [null]).map((c) => {
          const n = c ?? s
          return [
            label(s, true),
            c ? label(c, false) : '—',
            fmtBytes(n.value),
            n.deadPct === null ? '—' : `${n.deadPct}%`,
            `${mark(n.lvl)} ${t(`level.${n.lvl}`)}`,
          ]
        }),
      ),
    [tree, label, t],
  )
  // SizeTop 과 같은 규칙 — 받은 뒤 비면(또는 구 응답이라 tree 없음) 숨김
  if (slow && !tree?.nodes.length) return null
  return (
    <Panel
      id="tree"
      wide
      table={
        rowsT.length > 0 && (
          <Table
            head={[
              t('chart.col.schema'),
              t('chart.tbl'),
              t('chart.col.size'),
              t('chart.deadPct'),
              t('chart.col.level'),
            ]}
            rows={rowsT}
          />
        )
      }
    >
      {!slow ? (
        <Empty k="loading" />
      ) : (
        <>
          <ul className="text-muted-foreground flex flex-wrap gap-3 text-xs">
            {TREE_LVLS.map((l) => (
              <li key={l} className="flex items-center gap-1">
                <span
                  aria-hidden
                  className="inline-block size-2.5 rounded-sm"
                  style={{ background: lvlColor(l) }}
                />
                {mark(l)} {l === 'NA' ? t('chart.noStat') : t(`level.${l}`)}
              </li>
            ))}
          </ul>
          <EChart
            option={opt}
            height={(narrow) => (narrow ? 280 : 320)}
            ariaLabel={`${t('chart.tree')} : ${(tree?.nodes ?? [])
              .map((n) => `${label(n, true)} ${fmtBytes(n.value)}`)
              .join(', ')}`}
          />
          {tree?.partial && (
            <p className="text-muted-foreground text-xs">
              {t('chart.partial')}
            </p>
          )}
        </>
      )}
    </Panel>
  )
}

// P2 — 지금 세션 상태(도넛, 가운데 총 세션) + 대기 이벤트 TOP
function SessDonut({ fast }: { fast: BoardFast }) {
  const t = useTranslations('monitor.board.chart')
  const m = fast.sessMix
  const parts = useMemo(
    () => [
      {
        name: t('mix.active'),
        value: m.active,
        itemStyle: { color: SERIES[0] },
      },
      {
        name: t('mix.idleTx'),
        value: m.idleTx,
        itemStyle: { color: SERIES[1] },
      },
      { name: t('mix.idle'), value: m.idle, itemStyle: { color: SERIES[2] } },
    ],
    [m, t],
  )
  const opt = useCallback(
    (narrow: boolean): ChartOption => ({
      ...base(narrow),
      legend: { ...base(narrow).legend, show: true, bottom: 0, top: 'auto' },
      tooltip: {
        ...base(narrow).tooltip,
        trigger: 'item',
        formatter: '{b} : {c} ({d}%)',
      },
      title: {
        text: String(m.total),
        subtext: t('mix.total'),
        left: 'center',
        top: '36%',
        textStyle: { color: C.ink, fontSize: 22, fontWeight: 800 },
        subtextStyle: { color: C.text, fontSize: 11 },
      },
      series: [
        {
          type: 'pie',
          radius: ['55%', '80%'],
          center: ['50%', '45%'],
          padAngle: 1,
          itemStyle: {
            borderColor: C.surface,
            borderWidth: 2,
            borderRadius: 4,
          },
          label: { show: !narrow, color: C.text, formatter: '{c}' },
          data: parts.filter((p) => p.value > 0),
        },
      ],
    }),
    [parts, m.total, t],
  )
  return (
    <Panel
      id="sessState"
      table={
        <Table
          head={[t('col.item'), t('col.value')]}
          rows={[
            ...parts.map((p) => [p.name, p.value]),
            ...fast.waitTop.map((w) => [`${t('waitTop')} · ${w.type}`, w.cnt]),
          ]}
        />
      }
    >
      {m.total === 0 ? (
        <Empty k="noSess" />
      ) : (
        <EChart
          option={opt}
          height={220}
          ariaLabel={`${t('sessState')} : ${parts.map((p) => `${p.name} ${p.value}`).join(', ')}`}
        />
      )}
      <p className="text-muted-foreground text-xs">
        {t('waitTop')} :{' '}
        {fast.waitTop.length
          ? fast.waitTop
              .slice(0, 5)
              .map((w) => `${w.type} ${w.cnt}`)
              .join(' · ')
          : t('noWait')}
      </p>
    </Panel>
  )
}

// P3 — 세션 상태 누적 막대 + 락 대기 선(같은 '개수' 단위라 한 축)
function SessTrend({ rows }: { rows: SnapRow[] | null }) {
  const t = useTranslations('monitor.board.chart')
  const pts = useMemo(
    () =>
      (rows ?? []).map((r) => ({
        t: Date.parse(r.bkt_dtm),
        a: r.actv_sess_cnt,
        x: r.idle_tx_sess_cnt,
        o: Math.max(0, r.sess_cnt - r.actv_sess_cnt - r.idle_tx_sess_cnt),
        l: r.lock_wait_cnt,
      })),
    [rows],
  )
  const opt = useCallback(
    (narrow: boolean): ChartOption => {
      // 점이 많으면 막대가 1px 미만이 되어 사라지므로 누적 영역으로 바꾼다
      const dense = pts.length > DENSE_PTS
      const bar = (name: string, k: 'a' | 'x' | 'o', c: string) => ({
        type: dense ? 'line' : 'bar',
        name,
        stack: 's',
        ...(dense
          ? {
              showSymbol: false,
              connectNulls: false,
              lineStyle: { width: 1, color: c },
              areaStyle: { color: c, opacity: 0.6 },
              itemStyle: { color: c },
            }
          : {
              barMaxWidth: 14,
              itemStyle: { color: c, borderColor: C.surface, borderWidth: 1 },
            }),
        data: withGaps(pts.map((p) => [p.t, p[k]])),
      })
      return {
        ...base(narrow),
        tooltip: { ...base(narrow).tooltip, trigger: 'axis' },
        grid: {
          left: 8,
          right: 8,
          top: 32,
          bottom: 8,
          containLabel: true,
        },
        xAxis: timeAxis(narrow),
        yAxis: valAxis(narrow),
        series: [
          bar(t('mix.active'), 'a', SERIES[0]),
          bar(t('mix.idleTx'), 'x', SERIES[1]),
          bar(t('mix.idle'), 'o', SERIES[2]),
          {
            type: 'line',
            name: t('lockWait'),
            showSymbol: false,
            connectNulls: false,
            lineStyle: { width: 2, color: SERIES[3] },
            itemStyle: { color: SERIES[3] },
            data: withGaps(pts.map((p) => [p.t, p.l])),
          },
        ],
      }
    },
    [pts, t],
  )
  return (
    <Panel
      id="sessTrend"
      table={
        pts.length > 0 && (
          <Table
            head={[
              t('col.time'),
              t('mix.active'),
              t('mix.idleTx'),
              t('mix.idle'),
              t('lockWait'),
            ]}
            rows={pts.map((p) => [hhmm(p.t), p.a, p.x, p.o, p.l])}
          />
        )
      }
    >
      {rows === null ? (
        <Empty k="loading" />
      ) : pts.length < 2 ? (
        <Empty k="needHistory" />
      ) : (
        <EChart option={opt} ariaLabel={t('sessTrend')} />
      )}
    </Panel>
  )
}

// P4 — 처리량(tx/s) 막대 위, 롤백률(%) 선 아래 : 두 척도를 한 축에 겹치지 않게 x 축만 공유
function TpsCombo({ rows }: { rows: SnapRow[] | null }) {
  const t = useTranslations('monitor.board.chart')
  // 10분 넘는 공백·통계 초기화의 null 점은 남겨 선을 끊는다(P3·P5 와 같은 규칙)
  const d = useMemo(() => deltas(rows ?? []), [rows])
  const shown = d.filter((x) => x.tps !== null || x.rlbkPct !== null)
  const opt = useCallback(
    (narrow: boolean): ChartOption => ({
      ...base(narrow),
      tooltip: { ...base(narrow).tooltip, trigger: 'axis' },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      grid: [
        {
          left: 8,
          right: 8,
          top: 32,
          height: '38%',
          containLabel: true,
        },
        { left: 8, right: 8, top: '62%', bottom: 8, containLabel: true },
      ],
      xAxis: [
        { ...timeAxis(narrow, 0), axisLabel: { show: false } },
        timeAxis(narrow, 1),
      ],
      yAxis: [
        valAxis(narrow, (v) => `${v}/s`, 0),
        // 기준선(markLine)은 축 범위에 안 들어가므로 max 로 5% 선을 항상 축 안에 둔다
        {
          ...valAxis(narrow, (v) => `${v}%`, 1),
          max: (v: { max: number }) =>
            Math.ceil(Math.max(v.max, THR.rlbkPct[0] * 1.2)),
        },
      ],
      series: [
        {
          name: t('tps'),
          xAxisIndex: 0,
          yAxisIndex: 0,
          // 점이 많으면(360·1440분) 막대가 1px 미만이 되므로 SessTrend 처럼 영역 선으로
          ...(d.length > DENSE_PTS
            ? {
                type: 'line',
                showSymbol: false,
                connectNulls: false,
                lineStyle: { width: 1, color: SERIES[0] },
                areaStyle: { color: SERIES[0], opacity: 0.5 },
                itemStyle: { color: SERIES[0] },
              }
            : {
                type: 'bar',
                barMaxWidth: 14,
                itemStyle: { color: SERIES[0], borderRadius: [4, 4, 0, 0] },
              }),
          data: d.map((x) => [x.t, x.tps]),
        },
        {
          type: 'line',
          name: t('rlbk'),
          xAxisIndex: 1,
          yAxisIndex: 1,
          showSymbol: false,
          connectNulls: false,
          lineStyle: { width: 2, color: SERIES[1] },
          itemStyle: { color: SERIES[1] },
          data: d.map((x) => [x.t, x.rlbkPct]),
          markLine: {
            symbol: 'none',
            silent: true,
            lineStyle: { color: C.warn, type: 'dashed' },
            label: { color: C.text, formatter: '{c}%' },
            data: [{ yAxis: THR.rlbkPct[0] }],
          },
        },
      ],
    }),
    [d, t],
  )
  return (
    <Panel
      id="tpsCombo"
      table={
        shown.length > 0 && (
          <Table
            head={[t('col.time'), t('tps'), t('rlbk')]}
            rows={shown.map((x) => [hhmm(x.t), dash(x.tps), dash(x.rlbkPct)])}
          />
        )
      }
    >
      {rows === null ? (
        <Empty k="loading" />
      ) : shown.length < 2 ? (
        <Empty k="needHistory" />
      ) : (
        <EChart option={opt} height={260} ariaLabel={t('tpsCombo')} />
      )}
    </Panel>
  )
}

// P5 — 구간 캐시 적중률 선 + 기준선 95·99(끊긴 구간은 선을 잇지 않음)
function CacheTrend({ rows }: { rows: SnapRow[] | null }) {
  const t = useTranslations('monitor.board.chart')
  const d = useMemo(() => deltas(rows ?? []), [rows])
  const n = d.filter((x) => x.cachePct !== null).length
  const opt = useCallback(
    (narrow: boolean): ChartOption => ({
      ...base(narrow),
      tooltip: {
        ...base(narrow).tooltip,
        trigger: 'axis',
        valueFormatter: (v: unknown) =>
          v === null || v === undefined ? '—' : `${v}%`,
      },
      grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
      xAxis: timeAxis(narrow),
      yAxis: {
        ...valAxis(narrow, (v) => `${v}%`),
        min: (v: { min: number }) =>
          Math.max(0, Math.floor(Math.min(v.min, 94))),
        max: 100,
      },
      series: [
        {
          type: 'line',
          name: t('cacheHit'),
          showSymbol: false,
          connectNulls: false,
          lineStyle: { width: 2, color: SERIES[0] },
          itemStyle: { color: SERIES[0] },
          data: d.map((x) => [x.t, x.cachePct]),
          markLine: {
            symbol: 'none',
            silent: true,
            label: { color: C.text, formatter: '{c}%' },
            data: [
              {
                yAxis: THR.cachePct[0],
                lineStyle: { color: C.warn, type: 'dashed' },
              },
              {
                yAxis: THR.cachePct[1],
                lineStyle: { color: C.risk, type: 'dashed' },
              },
            ],
          },
        },
      ],
      legend: { show: false },
    }),
    [d, t],
  )
  return (
    <Panel
      id="cacheTrend"
      table={
        n > 0 && (
          <Table
            head={[t('col.time'), t('cacheHit')]}
            rows={d
              .filter((x) => x.cachePct !== null)
              .map((x) => [hhmm(x.t), `${x.cachePct}%`])}
          />
        )
      }
    >
      {rows === null ? (
        <Empty k="loading" />
      ) : n < 2 ? (
        <Empty k="needHistory" />
      ) : (
        <EChart option={opt} ariaLabel={t('cacheTrend')} />
      )}
    </Panel>
  )
}

// P6 — DB 크기 영역 + 증가 추세 예측 점선 + 한도선. 성능 수집 이력이 없으면 보드 스냅샷 크기로 보충
function Capacity({
  slow,
  rows,
}: {
  slow: BoardSlow | null
  rows: SnapRow[] | null
}) {
  const t = useTranslations('monitor.board.chart')
  const cap = slow?.capacity ?? null
  const pts = useMemo(() => {
    if (cap && cap.points.length >= 2) return cap.points
    return (rows ?? [])
      .filter((r) => r.db_sz_byte !== null)
      .map((r) => ({ t: Date.parse(r.bkt_dtm), bytes: r.db_sz_byte! }))
  }, [cap, rows])
  const fc = useMemo(() => {
    const last = pts[pts.length - 1]
    if (!last || !cap?.perDay || cap.perDay <= 0) return []
    // 예측 길이 = 관측 이력 길이 이하(최소 1일) — 짧은 이력이 왼쪽 끝에 눌리지 않게
    const span = Math.max(1, (last.t - pts[0].t) / 86_400_000)
    const days = Math.min(30, cap.daysLeft ?? 30, span)
    return [
      [last.t, last.bytes / GB],
      [last.t + days * 86_400_000, (last.bytes + cap.perDay * days) / GB],
    ]
  }, [pts, cap])
  const opt = useCallback(
    (narrow: boolean): ChartOption => ({
      ...base(narrow),
      tooltip: {
        ...base(narrow).tooltip,
        trigger: 'axis',
        valueFormatter: (v: unknown) =>
          typeof v === 'number' ? `${r1(v)} GB` : '—',
      },
      grid: {
        left: 8,
        right: 8,
        top: 32,
        bottom: 8,
        containLabel: true,
      },
      xAxis: timeAxis(narrow),
      // 한도선이 현재 크기보다 훨씬 위여도 보이게 축 max 를 한도의 105% 이상으로
      yAxis: {
        ...valAxis(narrow, (v) => `${v} GB`),
        ...(cap?.limitByte
          ? {
              max: (v: { max: number }) =>
                Math.ceil(Math.max(v.max, (cap.limitByte! / GB) * 1.05)),
            }
          : {}),
      },
      series: [
        {
          type: 'line',
          name: t('size'),
          showSymbol: false,
          lineStyle: { width: 2, color: SERIES[0] },
          itemStyle: { color: SERIES[0] },
          areaStyle: { color: SERIES[0], opacity: 0.18 },
          data: pts.map((p) => [p.t, p.bytes / GB]),
          ...(cap?.limitByte
            ? {
                markLine: {
                  symbol: 'none',
                  silent: true,
                  lineStyle: { color: C.risk, type: 'dashed' },
                  label: { color: C.text, formatter: `${t('limit')} {c} GB` },
                  data: [{ yAxis: r1(cap.limitByte / GB) }],
                },
              }
            : {}),
        },
        {
          type: 'line',
          name: t('forecast'),
          showSymbol: false,
          lineStyle: { width: 2, type: 'dashed', color: C.gray },
          itemStyle: { color: C.gray },
          data: fc,
        },
      ],
    }),
    [pts, fc, cap, t],
  )
  return (
    <Panel
      id="capacity"
      table={
        pts.length > 0 && (
          <Table
            head={[t('col.time'), t('size')]}
            rows={[
              ...pts.map((p) => [
                new Date(p.t).toLocaleString(),
                fmtBytes(p.bytes),
              ]),
              ...(cap?.daysLeft != null
                ? [[t('daysLeft'), Math.floor(cap.daysLeft)]]
                : []),
            ]}
          />
        )
      }
    >
      {pts.length < 2 ? (
        <Empty k={slow ? 'needPerf' : 'loading'} />
      ) : (
        <EChart
          option={opt}
          ariaLabel={
            cap?.daysLeft != null
              ? `${t('capacity')} : ${t('daysLeft')} ${Math.floor(cap.daysLeft)}`
              : t('capacity')
          }
        />
      )}
      {cap && (
        <p className="text-muted-foreground text-xs">
          {t('capNote', {
            perDay: cap.perDay === null ? '—' : fmtBytes(cap.perDay),
            days: cap.daysLeft === null ? '—' : Math.floor(cap.daysLeft),
          })}
        </p>
      )}
    </Panel>
  )
}

// P7 — 느린 SQL TOP10(총 시간 순) : 평균이 기준을 넘는 막대만 상태색 + 막대 끝 글자(색 외 구분)
function SlowTop({ slow }: { slow: BoardSlow | null }) {
  const t = useTranslations('monitor.board')
  const sig = slow?.signals.find((s) => s.id === 'SLOW_SQL')
  const { reason } = useSigText()
  const top = useMemo(() => [...(slow?.slowTop ?? [])].reverse(), [slow])
  const opt = useCallback(
    (narrow: boolean): ChartOption => ({
      ...base(narrow),
      tooltip: {
        ...base(narrow).tooltip,
        trigger: 'item',
        formatter: (p: { dataIndex: number }) => {
          const r = top[p.dataIndex]
          return `#${top.length - p.dataIndex} ${r.label.replace(/</g, '&lt;')}<br/>${t('chart.col.calls')} ${r.calls} · ${t('chart.col.mean')} ${Math.round(r.meanMs)} ms · ${t('chart.col.share')} ${Math.round(r.share * 100)}%`
        },
      },
      grid: {
        left: 8,
        right: 24,
        top: 8,
        bottom: 8,
        containLabel: true,
      },
      xAxis: {
        ...valAxis(narrow, (v) => (v >= 1000 ? `${r1(v / 1000)}s` : `${v}ms`)),
      },
      yAxis: {
        type: 'category',
        axisLine,
        axisTick: { show: false },
        axisLabel: { color: C.text, fontSize: narrow ? 9 : 11 },
        // 축 = 순위(SQL 앞 글자는 서로 같아 막대를 구분 못 함) — 전문은 툴팁·표
        data: top.map((_, i) => `#${top.length - i}`),
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 14,
          data: top.map((r) => ({
            value: Math.round(r.totalMs),
            itemStyle: {
              color:
                r.meanMs >= THR.slowMs[1]
                  ? C.risk
                  : r.meanMs >= THR.slowMs[0]
                    ? C.warn
                    : SERIES[0],
              borderRadius: [0, 4, 4, 0],
            },
          })),
          // ✕·▲ 글자는 좁은 화면에서도 남긴다(상태색 단독 금지)
          label: {
            show: true,
            position: 'right',
            color: C.text,
            fontSize: 10,
            formatter: (p: { dataIndex: number }) => {
              const m = top[p.dataIndex].meanMs
              return m >= THR.slowMs[1] ? '✕' : m >= THR.slowMs[0] ? '▲' : ''
            },
          },
        },
      ],
    }),
    [top, t],
  )
  return (
    <Panel
      id="slowTop"
      wide
      table={
        top.length > 0 && (
          <Table
            head={[
              'SQL',
              t('chart.col.calls'),
              t('chart.col.total'),
              t('chart.col.mean'),
              t('chart.col.share'),
            ]}
            rows={[...top]
              .reverse()
              .map((r, k) => [
                `#${k + 1} ${r.label}`,
                r.calls,
                Math.round(r.totalMs),
                Math.round(r.meanMs),
                `${Math.round(r.share * 100)}%`,
              ])}
          />
        )
      }
    >
      {!slow ? (
        <Empty k="loading" />
      ) : sig?.reason === 'PGSS' ? (
        <div className="space-y-2 text-sm">
          <p className="break-keep">{t('fix.PGSS')}</p>
          <CopyBtn text={SQL_CHECK.PGSS!} />
        </div>
      ) : top.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {(sig && reason(sig)) || t('chart.noData')}
        </p>
      ) : (
        <>
          <EChart
            option={opt}
            height={Math.max(180, top.length * 28)}
            ariaLabel={t('chart.slowTop')}
          />
          <p className="text-muted-foreground text-xs break-keep">
            {t('chart.slowLegend', {
              warn: THR.slowMs[0],
              risk: THR.slowMs[1],
            })}
          </p>
        </>
      )}
    </Panel>
  )
}

// P8 — 공간 TOP10(테이블 / 인덱스+TOAST 누적)
function SizeTop({ slow }: { slow: BoardSlow | null }) {
  const t = useTranslations('monitor.board.chart')
  const top = useMemo(() => [...(slow?.sizeTop ?? [])].reverse(), [slow])
  const opt = useCallback(
    (narrow: boolean): ChartOption => {
      const bar = (
        name: string,
        k: 'tblByte' | 'otherByte',
        c: string,
        last: boolean,
      ) => ({
        type: 'bar',
        name,
        stack: 's',
        barMaxWidth: 14,
        itemStyle: {
          color: c,
          borderColor: C.surface,
          borderWidth: 1,
          ...(last ? { borderRadius: [0, 4, 4, 0] } : {}),
        },
        data: top.map((r) => r1(r[k] / 1024 ** 2)),
      })
      return {
        ...base(narrow),
        tooltip: {
          ...base(narrow).tooltip,
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          valueFormatter: (v: unknown) => `${v} MB`,
        },
        grid: {
          left: 8,
          right: 8,
          top: 32,
          bottom: 8,
          containLabel: true,
        },
        xAxis: valAxis(narrow, (v) =>
          v >= 1024 ? `${r1(v / 1024)}G` : `${v}M`,
        ),
        yAxis: {
          type: 'category',
          axisLine,
          axisTick: { show: false },
          axisLabel: { color: C.text, fontSize: narrow ? 9 : 11 },
          // public. 접두사는 빼서 좁은 폭에서도 테이블명이 보이게
          data: top.map((r) => short(r.label.replace(/^public\./, ''), narrow)),
        },
        series: [
          bar(t('tbl'), 'tblByte', SERIES[0], false),
          bar(t('idxToast'), 'otherByte', SERIES[1], true),
        ],
      }
    },
    [top, t],
  )
  if (slow && top.length === 0) return null
  return (
    <Panel
      id="sizeTop"
      table={
        top.length > 0 && (
          <Table
            head={[t('col.item'), t('tbl'), t('idxToast')]}
            rows={[...top]
              .reverse()
              .map((r) => [
                r.label,
                fmtBytes(r.tblByte),
                fmtBytes(r.otherByte),
              ])}
          />
        )
      }
    >
      {!slow ? (
        <Empty k="loading" />
      ) : (
        <EChart
          option={opt}
          height={Math.max(180, top.length * 28)}
          ariaLabel={t('sizeTop')}
        />
      )}
    </Panel>
  )
}

// P9 — 신호 × 시간 구간 히트맵(구간 최악 레벨, 칸 글자 ✓▲✕ 로 색 외 구분). 저장 칼럼만 쓰는 축약 판정
function Heat({ rows, range }: { rows: SnapRow[] | null; range: PeriodMin }) {
  const t = useTranslations('monitor.board')
  const tl = useTranslations('monitor.board.level')
  const h = useMemo(
    () => (rows ? levelsByBucket(rows, range) : null),
    [rows, range],
  )
  // 표시 기준 = 열 수에 비례(최소 3열 또는 절반) — 30분(6열)에서 막 시작한 구간 1칸 비었다고 '이력 필요'로 떨어지지 않게, 빈 구간은 NA 칸
  const filled = h
    ? h.cols.filter((_, c) => h.cells.some((r) => r[c] !== 'NA')).length
    : 0
  const names = useMemo(
    () => (h ? h.rows.map((id) => t(`sig.${id}`)) : []),
    [h, t],
  )
  const opt = useCallback(
    (narrow: boolean): ChartOption => {
      if (!h) return {}
      const markPx = narrow && h.cols.length > 12 ? 7 : 9
      const data = h.cells.flatMap((r, ri) =>
        r.map((l, ci) => [ci, ri, LVL_IDX[l]]),
      )
      return {
        ...base(narrow),
        tooltip: {
          ...base(narrow).tooltip,
          trigger: 'item',
          formatter: (p: { data: number[] }) =>
            `${names[p.data[1]]} · ${hhmm(Date.parse(h.cols[p.data[0]]))}<br/>${LVL_MARK[p.data[2]]} ${tl((['NA', 'OK', 'UNKNOWN', 'WARN', 'RISK'] as const)[p.data[2]])}`,
        },
        grid: {
          left: 8,
          right: 8,
          top: 8,
          bottom: narrow ? 32 : 40,
          containLabel: true,
        },
        xAxis: {
          type: 'category',
          data: h.cols.map((c) => hhmm(Date.parse(c))),
          axisLine,
          axisTick: { show: false },
          axisLabel: { color: C.text, fontSize: 10, hideOverlap: true },
          splitArea: { show: false },
        },
        yAxis: {
          type: 'category',
          data: names.map((n) => short(n, narrow)),
          axisLine,
          axisTick: { show: false },
          axisLabel: { color: C.text, fontSize: narrow ? 9 : 11 },
        },
        visualMap: {
          type: 'piecewise',
          dimension: 2,
          orient: 'horizontal',
          left: 'center',
          bottom: 0,
          // 색 범례는 좁은 화면에서도 남긴다(작게)
          itemWidth: narrow ? 10 : 20,
          itemHeight: narrow ? 8 : 14,
          itemGap: narrow ? 4 : 10,
          textStyle: { color: C.text, fontSize: narrow ? 9 : 12 },
          pieces: [0, 1, 2, 3, 4].map((v) => ({
            value: v,
            label: `${LVL_MARK[v]} ${tl((['NA', 'OK', 'UNKNOWN', 'WARN', 'RISK'] as const)[v])}`,
            color: LVL_COLOR[v],
          })),
        },
        series: [
          {
            type: 'heatmap',
            data,
            itemStyle: {
              borderColor: C.surface,
              borderWidth: 2,
              borderRadius: 3,
            },
            // 주의·위험 칸은 열이 많아도 ▲·✕ 를 남긴다. 위험 칸 글자는 흰색(#d03b3b 대비 4.8:1)
            label: {
              show: true,
              formatter: (p: { data: number[] }) =>
                p.data[2] === 4 ? '{r|✕}' : p.data[2] === 3 ? '{w|▲}' : '',
              rich: {
                r: { color: '#fff', fontSize: markPx },
                w: { color: '#0b0d14', fontSize: markPx },
              },
            },
          },
        ],
      }
    },
    [h, names, tl],
  )
  return (
    <Panel
      id="heat"
      wide
      table={
        h &&
        filled > 0 && (
          <Table
            head={[
              t('chart.col.item'),
              ...h.cols.map((c) => hhmm(Date.parse(c))),
            ]}
            rows={h.rows.map((_, ri) => [
              names[ri],
              ...h.cells[ri].map((l) => LVL_MARK[LVL_IDX[l]]),
            ])}
          />
        )
      }
    >
      {rows === null ? (
        <Empty k="loading" />
      ) : !h || filled < Math.min(3, h.cols.length / 2) ? (
        <Empty k="needHistory" />
      ) : (
        <EChart option={opt} height={260} ariaLabel={t('chart.heat')} />
      )}
    </Panel>
  )
}
