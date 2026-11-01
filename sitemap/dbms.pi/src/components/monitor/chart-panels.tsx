'use client'

// 모니터링 보드 차트 영역(ECharts) — 모니터 화면이 next/dynamic(ssr:false)로만 불러와 첫 화면 번들에서 빠진다. 화면에 들어오기 직전(rootMargin 200px)에만 이력 조회
//  P1 게이지(연결·캐시) · P2 도넛(세션 상태) · P3 누적 막대+선(세션 추이·락 대기, 한 축) · P4 처리량/롤백 위아래 2단(이중 축 대신) · P5 캐시 적중률 선 · P6 용량 영역+예측 점선
//  · P7 느린 SQL TOP10 · P8 공간 TOP10 누적 막대 · P9 신호×시간 히트맵. 퍼널은 전환 데이터가 없어 쓰지 않는다. 모든 패널은 질문 한 줄 + '표로 보기' 동반
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
  levelsByBucket,
  THR,
  type BoardFast,
  type BoardSlow,
  type HistoryRes,
  type Lvl,
  type SnapRow,
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

type Props = { sel: Sel; fast: BoardFast | null; slow: BoardSlow | null }

export default function ChartPanels({ sel, fast, slow }: Props) {
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
          {fast && <Gauges fast={fast} />}
          {fast && <SessDonut fast={fast} />}
          <SessTrend rows={rows} />
          <TpsCombo rows={rows} />
          <CacheTrend rows={rows} />
          <Capacity slow={slow} rows={rows} />
          <SlowTop slow={slow} />
          <SizeTop slow={slow} />
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

// P1 — 연결 사용률·캐시 적중률 게이지(상태 띠)
function Gauges({ fast }: { fast: BoardFast }) {
  const t = useTranslations('monitor.board')
  const conn =
    fast.kpi.sess !== null && fast.kpi.maxConn
      ? r1((fast.kpi.sess / fast.kpi.maxConn) * 100)
      : null
  const cache = fast.kpi.cachePct
  const opt = useCallback(
    (narrow: boolean): ChartOption => {
      const g = (
        center: string,
        v: number | null,
        min: number,
        bands: [number, string][],
        name: string,
      ) => ({
        type: 'gauge',
        center: [center, '62%'],
        // 두 게이지가 반쪽 폭씩 나눠 쓰므로 narrow 면 반지름을 줄여 겹침·잘림을 막는다
        radius: narrow ? '58%' : '90%',
        startAngle: 200,
        endAngle: -20,
        min,
        max: 100,
        splitNumber: 2,
        axisLine: { lineStyle: { width: 10, color: bands } },
        pointer: { width: 4, itemStyle: { color: C.ink } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { color: C.text, fontSize: 10, distance: 14 },
        title: {
          color: C.text,
          fontSize: narrow ? 11 : 12,
          offsetCenter: [0, '70%'],
        },
        detail: {
          color: C.ink,
          fontSize: narrow ? 16 : 20,
          fontWeight: 700,
          offsetCenter: [0, '35%'],
          formatter: v === null ? '—' : '{value}%',
        },
        data: [{ value: v ?? min, name }],
      })
      return {
        ...base(narrow),
        tooltip: { show: false },
        series: [
          g(
            '25%',
            conn,
            0,
            [
              [THR.connPct[0] / 100, C.ok],
              [THR.connPct[1] / 100, C.warn],
              [1, C.risk],
            ],
            t('sig.CONN_USE'),
          ),
          // 캐시 80~100% 구간 — 95 미만 위험, 99 미만 주의
          g(
            '75%',
            cache,
            80,
            [
              [(THR.cachePct[1] - 80) / 20, C.risk],
              [(THR.cachePct[0] - 80) / 20, C.warn],
              [1, C.ok],
            ],
            t('sig.CACHE_HIT'),
          ),
        ],
      }
    },
    [conn, cache, t],
  )
  return (
    <Panel
      id="gauges"
      table={
        <Table
          head={[t('chart.col.item'), t('chart.col.value')]}
          rows={[
            [t('sig.CONN_USE'), conn === null ? '—' : `${conn}%`],
            [t('sig.CACHE_HIT'), cache === null ? '—' : `${cache}%`],
          ]}
        />
      }
    >
      <EChart
        option={opt}
        height={200}
        ariaLabel={`${t('chart.gauges')} : ${t('sig.CONN_USE')} ${dash(conn)}%, ${t('sig.CACHE_HIT')} ${dash(cache)}%`}
      />
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
