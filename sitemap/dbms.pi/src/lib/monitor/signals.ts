// 모니터링 관문 보드 순수 평가(클라이언트·서버 공용) — 감시 신호 14개(5범주) 판정·전체 요약·할 일·추이 Δ·히트맵 구간 판정·사용자 규칙 적용
//  런타임 import 없음(타입만 — node 타입 제거로 사라짐). 입력은 board-server.ts 가 파싱한 객체, 문자열 = 그 조회의 오류 코드
//  시험 : node --test src/lib/monitor/signals.test.mjs
import type { MetricCd, Rule, UrlCheck } from './rules'

export type Lvl = 'OK' | 'WARN' | 'RISK' | 'UNKNOWN' | 'NA'
export type Cat = 'avail' | 'load' | 'eff' | 'store' | 'protect'
export type SigId =
  | 'AVAIL'
  | 'CONN_USE'
  | 'URL'
  | 'LONG_QRY'
  | 'IDLE_TX'
  | 'LOCK_WAIT'
  | 'CACHE_HIT'
  | 'XACT_ERR'
  | 'SLOW_SQL'
  | 'STORAGE'
  | 'VACUUM'
  | 'INDEX'
  | 'BACKUP'
  | 'REPL'
export type Tier = 'fast' | 'slow'
export type TopItem = {
  key: string
  label: string
  value: number
  sub?: string
  lvl?: Lvl
}
export type Signal = {
  id: SigId
  cat: Cat
  tier: Tier
  lvl: Lvl
  value: number | null
  unit: 'ms' | 'pct' | 'cnt' | 'sec' | 'byte' | ''
  thr: { warn: number; risk: number; down?: boolean } | null // down = 작을수록 나쁨
  // UNKNOWN·NA·참고 사유 : CONN_DOWN|PGSS|VER|SAMPLE|NO_LIMIT|RESET|STALE|STANDBY|NONE|GRANT|LINK_<code>
  reason: string | null
  partial: boolean // 500행 상한·권한 부족으로 일부만 봄
  params: Record<string, string | number> // fix 문구 params (rule = 위반한 내 규칙, basis = live|stored)
  top: TopItem[] // 카드 상세 TOP5~10, 쿼리문은 120자 절삭
  at: string
}
export type Kpi = {
  sess: number | null
  maxConn: number | null
  tps: number | null
  cachePct: number | null
  dbSzByte: number | null
}
export type SessMix = {
  active: number
  idleTx: number
  idle: number
  total: number
}
export type FastErrKey = 'db_stats' | 'activity' | 'version' | 'locks'
export type SlowErrKey =
  | 'top_sql'
  | 'tbl_stats'
  | 'idx_stats'
  | 'sizes'
  | 'archiver'
  | 'replication'
  | 'version'
  | 'summary'
export type BoardFast = {
  tier: 'fast'
  at: string
  signals: Signal[]
  kpi: Kpi
  sessMix: SessMix
  waitTop: { type: string; cnt: number }[]
  flow: SessFlow
  errors: Partial<Record<FastErrKey, string>>
}
export type AppSum = {
  reqCnt: number
  errCnt: number
  slowCnt: number
  tps: number
  errPct: number
  avgMs: number | null
}
export type Capacity = {
  points: { t: number; bytes: number }[]
  limitByte: number | null
  perDay: number | null
  daysLeft: number | null
}
export type BoardSlow = {
  tier: 'slow'
  at: string
  signals: Signal[]
  slowTop: {
    key: string
    label: string
    calls: number
    maxMs: number // 1회 최고 시간 — 순위·색·경보 기준(마스터 2026-11-02)
    meanMs: number // 보조 표시
  }[] // ≤10
  sizeTop: { label: string; tblByte: number; otherByte: number }[] // ≤10
  capacity: Capacity
  tree: SizeTree
  app: AppSum | null // 보조 '연계 상태'(schema.pi 서비스 응답) — /api/monitor/summary 를 따로 부르지 않게
  errors: Partial<Record<SlowErrKey, string>>
}
// 일시 오류(다음 주기에 풀릴 수 있음) — slow 결과에 있으면 짧게 캐시·다음 주기 재시도. RATE 는 재시도가 부하를 키우므로 제외(화면이 주기 2배)
const TRANSIENT = new Set(['TIMEOUT', 'LINK_DOWN', 'CONN_FAIL'])
export const hasTransient = (errors: Partial<Record<string, string>>) =>
  Object.values(errors).some((c) => !!c && TRANSIENT.has(c))
// dbm_mon_snap(sql/031) 읽기 행 — history API·직전 스냅샷
export type SnapRow = {
  bkt_dtm: string
  stat_reset_dtm: string | null
  sess_cnt: number
  actv_sess_cnt: number
  idle_tx_sess_cnt: number
  lock_wait_cnt: number
  long_qry_cnt: number
  max_run_ms: number
  max_idle_tx_ms: number
  xact_cmt_cnt: number | null
  xact_rlbk_cnt: number | null
  blks_hit_cnt: number | null
  blks_read_cnt: number | null
  dlck_cnt: number | null
  db_sz_byte: number | null
  max_conn_cnt: number | null
}
// 쓰기 값(키·시스템 칼럼 제외) — rsp_ms·tmp_sz_byte 포함(sql/031 전 칼럼)
export type SnapVals = Omit<SnapRow, 'bkt_dtm'> & {
  rsp_ms: number
  tmp_sz_byte: number | null
}
export type SnapInsert = SnapVals & {
  lnk_id: string
  conn_id: string
  bkt_dtm: string
  regr_id: string
  modr_id: string
}
export type Range = 30 | 60 | 360 | 1440
export type HistoryRes = { range: Range; rows: SnapRow[]; at: string }

// ── 파싱된 입력 행 ──
export type DbStats = {
  ms: number
  xactCmt: number | null
  xactRlbk: number | null
  blksHit: number | null
  blksRead: number | null
  cachePct: number | null
  deadlocks: number | null
  tempBytes: number | null
  dbSz: number | null
  statsReset: string | null
}
export type ActRow = {
  pid: number
  usename: string | null
  appNm: string | null // application_name
  backendType: string | null
  state: string | null
  waitType: string | null
  xactStart: string | null
  queryStart: string | null
  runMs: number | null
  query: string | null
  queryId: string | null // query_id(PG14+·compute_query_id·pg_read_all_stats 조건 — 아니면 null)
  clientAddr: string | null // 원주소 — 출처 표본 저장 전 maskAddr 필수(계약 A3)
  linkUsr?: string | null // 연결 계정명(current_user — schema.pi 구버전이면 없음)
}
export type Version = {
  versionNum: number | null
  inRecovery: boolean | null
  startDtm: string | null
  maxConn: number | null
}
export type LockRow = {
  pid: number
  granted: boolean
  blockedBy: number[]
  relNm: string | null
}
export type TopRow = {
  queryid: string
  query: string
  calls: number
  maxMs: number
  meanMs: number
}
export type TblRow = {
  schema: string
  rel: string
  seqScan: number
  seqTupRead: number
  idxScan: number
  liveTup: number
  deadTup: number
  modSinceAnalyze: number
  lastVacuum: string | null // max(last_vacuum, last_autovacuum)
  lastAnalyze: string | null // max(last_analyze, last_autoanalyze)
}
export type IdxRow = {
  schema: string
  rel: string
  idx: string
  idxScan: number
  idxSz: number
  uniq: boolean
  pk: boolean
  valid: boolean
}
export type SizeRow = {
  schema: string
  rel: string
  tblSz: number
  idxSz: number
  toastSz: number
  totalSz: number // pg_total_relation_size(없으면 tbl+idx+toast)
}
export type ArcRow = {
  archivedCount: number
  lastArchivedTime: string | null
  failedCount: number
  lastFailedTime: string | null
  archiveMode: string | null
}
export type ReplRow = {
  appNm: string | null
  state: string | null
  sentLsn: string | null
  replayLsn: string | null
  replayLag: string | null
}
type In<T> = T | string // string = 오류 코드
export type RuleVals = Partial<Record<MetricCd, number | null>>

// ── 기준값(한 곳) — PG 기본값·운영 통념·ops LAG{5,60} 와 일치 ──
export const THR = {
  connPct: [70, 85],
  rspMs: [1500, 3500],
  uptimeMin: 10,
  longMs: [30_000, 300_000],
  idleMs: [60_000, 600_000],
  lockWaiters: 5,
  dlck: [1, 3],
  cachePct: [99, 95],
  rlbkPct: [5, 20],
  slowMs: [500, 3000],
  storePct: [70, 85],
  storeDays: [30, 7],
  deadPct: [20, 50],
  deadMin: 1000,
  deadRiskMin: 10_000,
  deadHuge: 100_000,
  unusedIdxByte: 8 * 1024 ** 2,
  seqLive: 1000,
  seqMin: 100,
  seqRatio: 0.5,
  seqRisk: { live: 100_000, ratio: 0.8, tupRead: 10_000_000 },
  replSec: [5, 60],
  replBytes: 256 * 1024 ** 2,
  urlMs: [2000, 5000],
  urlErrPct: 10,
  urlStaleMs: 15 * 60_000,
} as const
export const PREV_MAX_MS = 10 * 60_000 // 이보다 오래된 직전 스냅샷·이력 간격은 Δ 계산에 쓰지 않음(evalFast·deltas 공통)
export const SAMPLE = { blks: 10_000, xact: 100 } // Δ 표본이 이보다 작으면 누적값으로, 누적도 작으면 UNKNOWN(SAMPLE)
export const MAX_ROWS = 500 // 이름 붙인 조회 행 상한(schema.pi)
const DAY = 86_400_000
const HOUR = 3_600_000
const MIB = 1024 ** 2
// 설정성 사유 — 전체 판정·확인 불가 건수에서 빼고 '설정 필요' 칸에만 센다
export const SETUP_REASONS = ['PGSS', 'NO_LIMIT', 'RESET', 'VER'] as const
const SETUP = new Set<string>(SETUP_REASONS)

const CAT: Record<SigId, Cat> = {
  AVAIL: 'avail',
  CONN_USE: 'avail',
  URL: 'avail',
  LONG_QRY: 'load',
  IDLE_TX: 'load',
  LOCK_WAIT: 'load',
  CACHE_HIT: 'eff',
  XACT_ERR: 'eff',
  SLOW_SQL: 'eff',
  STORAGE: 'store',
  VACUUM: 'store',
  INDEX: 'store',
  BACKUP: 'protect',
  REPL: 'protect',
}
const SLOW_IDS = new Set<SigId>([
  'URL',
  'SLOW_SQL',
  'STORAGE',
  'VACUUM',
  'INDEX',
  'BACKUP',
  'REPL',
])
export const SIG_IDS = Object.keys(CAT) as SigId[]
const CAT_ORDER: Cat[] = ['avail', 'load', 'protect', 'eff', 'store']
const LVL_RANK: Record<Lvl, number> = {
  RISK: 4,
  WARN: 3,
  UNKNOWN: 2,
  OK: 1,
  NA: 0,
}

const sig = (
  id: SigId,
  lvl: Lvl,
  at: string,
  o: Partial<Signal> = {},
): Signal => ({
  id,
  cat: CAT[id],
  tier: SLOW_IDS.has(id) ? 'slow' : 'fast',
  lvl,
  value: null,
  unit: '',
  thr: null,
  reason: null,
  partial: false,
  params: {},
  top: [],
  at,
  ...o,
})
const up = (v: number, [w, r]: readonly [number, number]): Lvl =>
  v >= r ? 'RISK' : v >= w ? 'WARN' : 'OK'
const down = (v: number, [w, r]: readonly [number, number]): Lvl =>
  v < r ? 'RISK' : v < w ? 'WARN' : 'OK'
const r2 = (v: number) => Math.round(v * 100) / 100
const cut = (s: string | null | undefined, n = 120) =>
  !s ? '' : s.length > n ? s.slice(0, n) + '…' : s
const ts = (v: string | null | undefined) => (v ? Date.parse(v) : NaN)
const sameT = (a: string | null, b: string | null) =>
  (a ? Date.parse(a) : null) === (b ? Date.parse(b) : null)
const dlt = (
  cur: number | null,
  prev: number | null | undefined,
): number | null =>
  cur === null || prev === null || prev === undefined
    ? null
    : cur - prev >= 0
      ? cur - prev
      : null
const unk = (id: SigId, at: string, code: string, down: boolean) =>
  sig(id, 'UNKNOWN', at, { reason: down ? 'CONN_DOWN' : `LINK_${code}` })

export function worst(lvls: Lvl[]): Lvl {
  let w: Lvl = 'NA'
  for (const l of lvls) if (LVL_RANK[l] > LVL_RANK[w]) w = l
  return w
}

export const isClient = (r: ActRow) => r.backendType === 'client backend'
export const isLockWaiter = (r: ActRow) =>
  isClient(r) && r.state === 'active' && r.waitType === 'Lock'
const isActive = (s: string | null) =>
  s === 'active' || s === 'fastpath function call'
const isIdleTx = (s: string | null) =>
  !!s && s.startsWith('idle in transaction')
// 방치 트랜잭션 나이 = (지금 − 마지막 쿼리 시작) + (마지막 쿼리 시작 − 트랜잭션 시작) — DB 시계 기준(run_ms)이라 서버 시계 차이 없음
const idleAge = (r: ActRow) => {
  const q = ts(r.queryStart),
    x = ts(r.xactStart)
  return (
    (r.runMs ?? 0) +
    (Number.isNaN(q) || Number.isNaN(x) ? 0 : Math.max(0, q - x))
  )
}

// ── 빠른 층(db_stats·activity·version [+ 대기 있을 때 locks]) ──
export function evalFast(i: {
  dbStats: In<DbStats>
  activity: In<ActRow[]>
  version: In<Version>
  locks: LockRow[] | null
  prev: SnapRow | null
  now: number
}) {
  const at = new Date(i.now).toISOString()
  const ds = typeof i.dbStats === 'string' ? null : i.dbStats
  const act = typeof i.activity === 'string' ? null : i.activity
  const ver = typeof i.version === 'string' ? null : i.version
  // CONN_FAIL 만 'DB 다운' — 나머지 빠른 신호는 CONN_DOWN 으로 묶는다. TIMEOUT 은 연결 4초 중단과 구분 불가라 UNKNOWN(화면이 3연속 시 RISK 승격)
  const dn = i.dbStats === 'CONN_FAIL'
  const errOf = (v: unknown) => (typeof v === 'string' ? v : null)
  // 직전 스냅샷 — 10분 이내·통계 초기화 같음만
  const prev =
    i.prev &&
    ds &&
    i.now - ts(i.prev.bkt_dtm) <= PREV_MAX_MS &&
    ts(i.prev.bkt_dtm) <= i.now &&
    sameT(i.prev.stat_reset_dtm, ds.statsReset)
      ? i.prev
      : null
  const out: Signal[] = []

  // AVAIL
  if (ds) {
    const st = ts(ver?.startDtm)
    const upMin = Number.isNaN(st) ? null : Math.floor((i.now - st) / 60_000)
    const l = up(ds.ms, THR.rspMs)
    out.push(
      sig(
        'AVAIL',
        l === 'OK' && upMin !== null && upMin < THR.uptimeMin ? 'WARN' : l,
        at,
        {
          value: ds.ms,
          unit: 'ms',
          thr: { warn: THR.rspMs[0], risk: THR.rspMs[1] },
          params: {
            ms: ds.ms,
            ...(upMin !== null ? { uptimeMin: upMin } : {}),
          },
        },
      ),
    )
  } else {
    const code = i.dbStats as string
    out.push(
      dn
        ? sig('AVAIL', 'RISK', at, { params: { code } })
        : sig('AVAIL', 'UNKNOWN', at, {
            reason: `LINK_${code}`,
            params: { code },
          }),
    )
  }

  const cb = act ? act.filter(isClient) : []
  const actPartial =
    !!act && (act.length >= MAX_ROWS || cb.some((r) => r.state === null))
  const actv = cb.filter((r) => isActive(r.state))
  const idleTx = cb.filter((r) => isIdleTx(r.state))
  const waiters = cb.filter(isLockWaiter)
  const actErr = errOf(i.activity)

  // CONN_USE — activity 는 current_database()·자기 접속 제외라 '이 DB 세션 기준'(클러스터 전체 아님).
  //   max_connections 는 클러스터 한도 → 다른 DB 접속이 많으면 낮게 나온다(화면 라벨에 명시).
  //   클러스터 합계는 schema.pi 조회 추가가 필요한 후속 과제
  if (dn || !act || !ver || ver.maxConn === null || ver.maxConn <= 0) {
    out.push(unk('CONN_USE', at, actErr ?? errOf(i.version) ?? 'NO_DATA', dn))
  } else {
    const pct = r2((cb.length / ver.maxConn) * 100)
    const byUser = new Map<string, number>()
    for (const r of cb)
      byUser.set(r.usename ?? '-', (byUser.get(r.usename ?? '-') ?? 0) + 1)
    out.push(
      sig('CONN_USE', up(pct, THR.connPct), at, {
        value: pct,
        unit: 'pct',
        thr: { warn: THR.connPct[0], risk: THR.connPct[1] },
        partial: act.length >= MAX_ROWS,
        params: { sess: cb.length, max: ver.maxConn },
        top: [...byUser]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([k, v]) => ({ key: k, label: k, value: v })),
      }),
    )
  }

  // LONG_QRY · IDLE_TX · LOCK_WAIT
  if (dn || !act) {
    for (const id of ['LONG_QRY', 'IDLE_TX', 'LOCK_WAIT'] as const)
      out.push(unk(id, at, actErr ?? 'NO_DATA', dn))
  } else {
    const run = actv
      .map((r) => ({ r, ms: r.runMs ?? 0 }))
      .sort((a, b) => b.ms - a.ms)
    const maxRun = run[0]?.ms ?? 0
    out.push(
      sig('LONG_QRY', up(maxRun, THR.longMs), at, {
        value: Math.round(maxRun / 1000),
        unit: 'sec',
        thr: { warn: THR.longMs[0] / 1000, risk: THR.longMs[1] / 1000 },
        partial: actPartial,
        params: {
          sec: Math.round(maxRun / 1000),
          n: run.filter((x) => x.ms > THR.longMs[0]).length,
        },
        top: run.slice(0, 5).map(({ r, ms }) => ({
          key: String(r.pid),
          label: `pid ${r.pid}`,
          value: ms,
          sub: cut(r.query),
          lvl: up(ms, THR.longMs),
        })),
      }),
    )
    const idl = idleTx
      .map((r) => ({ r, ms: idleAge(r) }))
      .sort((a, b) => b.ms - a.ms)
    const maxIdle = idl[0]?.ms ?? 0
    out.push(
      sig('IDLE_TX', up(maxIdle, THR.idleMs), at, {
        value: Math.round(maxIdle / 1000),
        unit: 'sec',
        thr: { warn: THR.idleMs[0] / 1000, risk: THR.idleMs[1] / 1000 },
        partial: actPartial,
        params: { sec: Math.round(maxIdle / 1000), n: idl.length },
        top: idl.slice(0, 5).map(({ r, ms }) => ({
          key: String(r.pid),
          label: `pid ${r.pid}`,
          value: ms,
          sub: cut(r.query),
          lvl: up(ms, THR.idleMs),
        })),
      }),
    )
    // 판정 = 대기 세션 수만(runMs 는 쿼리 총 실행 시간이지 락 대기 시간이 아님 — 오래 도는 정상 쿼리 오판 방지)
    const lw: Lvl =
      waiters.length === 0
        ? 'OK'
        : waiters.length >= THR.lockWaiters
          ? 'RISK'
          : 'WARN'
    // 막고 있는 세션 TOP5 — locks(대기 있을 때만 조회)의 blocked_by 집계
    const blk = new Map<number, number>()
    for (const l of i.locks ?? [])
      if (!l.granted)
        for (const p of l.blockedBy) blk.set(p, (blk.get(p) ?? 0) + 1)
    const qOf = new Map(act.map((r) => [r.pid, r.query]))
    out.push(
      sig('LOCK_WAIT', lw, at, {
        value: waiters.length,
        unit: 'cnt',
        thr: { warn: 1, risk: THR.lockWaiters },
        partial: actPartial,
        params: { n: waiters.length },
        top: [...blk]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([p, c]) => ({
            key: String(p),
            label: `pid ${p}`,
            value: c,
            sub: cut(qOf.get(p)),
          })),
      }),
    )
  }

  // CACHE_HIT · XACT_ERR — 직전 스냅샷 대비 Δ(표본 충분), 아니면 통계 초기화 이후 누적
  let cachePct: number | null = null
  let tps: number | null = null
  if (dn || !ds) {
    out.push(
      unk('CACHE_HIT', at, errOf(i.dbStats) ?? 'NO_DATA', dn),
      unk('XACT_ERR', at, errOf(i.dbStats) ?? 'NO_DATA', dn),
    )
  } else {
    const since: Record<string, string> = ds.statsReset
      ? { since: ds.statsReset }
      : {}
    const dh = prev ? dlt(ds.blksHit, prev.blks_hit_cnt) : null
    const dr = prev ? dlt(ds.blksRead, prev.blks_read_cnt) : null
    const cumB = (ds.blksHit ?? 0) + (ds.blksRead ?? 0)
    if (dh !== null && dr !== null && dh + dr >= SAMPLE.blks)
      cachePct = r2((dh / (dh + dr)) * 100)
    else if (ds.blksHit !== null && ds.blksRead !== null && cumB >= SAMPLE.blks)
      cachePct = ds.cachePct ?? r2((ds.blksHit / cumB) * 100)
    const cBasis =
      dh !== null && dr !== null && dh + dr >= SAMPLE.blks ? 'live' : 'stored'
    out.push(
      cachePct === null
        ? sig('CACHE_HIT', 'UNKNOWN', at, { reason: 'SAMPLE' })
        : sig('CACHE_HIT', down(cachePct, THR.cachePct), at, {
            value: cachePct,
            unit: 'pct',
            thr: { warn: THR.cachePct[0], risk: THR.cachePct[1], down: true },
            params: { pct: cachePct, basis: cBasis, ...since },
          }),
    )
    const dc = prev ? dlt(ds.xactCmt, prev.xact_cmt_cnt) : null
    const dbk = prev ? dlt(ds.xactRlbk, prev.xact_rlbk_cnt) : null
    const dl = prev ? dlt(ds.deadlocks, prev.dlck_cnt) : null
    const live = dc !== null && dbk !== null && dc + dbk >= SAMPLE.xact
    const cumX = (ds.xactCmt ?? 0) + (ds.xactRlbk ?? 0)
    const rlbk = live
      ? r2((dbk! / (dc! + dbk!)) * 100)
      : ds.xactCmt !== null && ds.xactRlbk !== null && cumX >= SAMPLE.xact
        ? r2((ds.xactRlbk / cumX) * 100)
        : null
    const dtSec = prev
      ? (Math.floor(i.now / 60_000) * 60_000 - ts(prev.bkt_dtm)) / 1000
      : 0
    // ponytail: 분 절삭 구간 차이로 초를 잡아 ±1분 오차 — 정확히 하려면 스냅샷에 수집 시각 칼럼(sql/032)
    if (dc !== null && dbk !== null && dtSec > 0) tps = r2((dc + dbk) / dtSec)
    const lx = worst([
      rlbk === null ? 'NA' : up(rlbk, THR.rlbkPct),
      dl === null ? 'NA' : up(dl, THR.dlck),
    ])
    out.push(
      lx === 'NA'
        ? sig('XACT_ERR', 'UNKNOWN', at, { reason: 'SAMPLE' })
        : sig('XACT_ERR', lx, at, {
            value: rlbk,
            unit: 'pct',
            thr: { warn: THR.rlbkPct[0], risk: THR.rlbkPct[1] },
            params: {
              pct: rlbk ?? 0,
              dlck: dl ?? 0,
              basis: live ? 'live' : 'stored',
              ...since,
            },
          }),
    )
  }

  const waitM = new Map<string, number>()
  for (const r of actv)
    if (r.waitType) waitM.set(r.waitType, (waitM.get(r.waitType) ?? 0) + 1)
  const kpi: Kpi = {
    sess: act ? cb.length : null,
    maxConn: ver?.maxConn ?? null,
    tps,
    cachePct,
    dbSzByte: ds?.dbSz ?? null,
  }
  const sessMix: SessMix = {
    active: actv.length,
    idleTx: idleTx.length,
    idle: cb.length - actv.length - idleTx.length,
    total: cb.length,
  }
  // 스냅샷 = 세 조회 모두 성공일 때만(일부 실패면 NOT NULL DEFAULT 0 칼럼에 가짜 0 이 남는다)
  const snap: SnapVals | null =
    ds && act && ver
      ? {
          stat_reset_dtm: ds.statsReset,
          rsp_ms: Math.round(ds.ms),
          max_conn_cnt: ver.maxConn,
          sess_cnt: cb.length,
          actv_sess_cnt: actv.length,
          idle_tx_sess_cnt: idleTx.length,
          lock_wait_cnt: waiters.length,
          long_qry_cnt: actv.filter((r) => (r.runMs ?? 0) > THR.longMs[0])
            .length,
          max_run_ms: Math.max(0, ...actv.map((r) => r.runMs ?? 0)),
          max_idle_tx_ms: Math.max(0, ...idleTx.map(idleAge)),
          xact_cmt_cnt: ds.xactCmt,
          xact_rlbk_cnt: ds.xactRlbk,
          blks_hit_cnt: ds.blksHit,
          blks_read_cnt: ds.blksRead,
          dlck_cnt: ds.deadlocks,
          tmp_sz_byte: ds.tempBytes,
          db_sz_byte: ds.dbSz,
        }
      : null
  const vals: RuleVals = {
    DB_SESS_CNT: kpi.sess,
    DB_LOCK_WAIT_CNT: act ? waiters.length : null,
    DB_CACHE_HIT_PCT: cachePct,
  }
  return {
    signals: out,
    kpi,
    sessMix,
    waitTop: [...waitM]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, cnt]) => ({ type, cnt })),
    flow: dn || !act ? EMPTY_FLOW : sessFlow(cb, act.length >= MAX_ROWS),
    snap,
    vals,
  }
}

// ── 산키(앱 → 계정 → 상태) — 클라이언트 세션만(합계 = sessMix.total). 쿼리문·pid·주소 미포함(A3) ──
export const FLOW_TOP = 6
export type FlowState = 'lockWait' | 'active' | 'idleTx' | 'idle'
export type FlowNode = {
  id: string // 'a:<app>' · 'u:<user>' · 's:<state>' — 접두사로 열 구분(순환 없음)
  kind: 'app' | 'user' | 'state'
  label: string // '' = 앱 이름 없음, 또는(fold 있으면) 기타
  value: number
  fold?: number // 'a:*'·'u:*' 에 접힌 개체 수
}
export type SessFlow = {
  nodes: FlowNode[]
  links: { source: string; target: string; value: number }[]
  partial: boolean
}
const EMPTY_FLOW: SessFlow = { nodes: [], links: [], partial: false }
const FLOW_STATES: FlowState[] = ['lockWait', 'active', 'idleTx', 'idle']
const flowState = (r: ActRow): FlowState =>
  isLockWaiter(r)
    ? 'lockWait'
    : isActive(r.state)
      ? 'active'
      : isIdleTx(r.state)
        ? 'idleTx'
        : 'idle'
// 세션 수 상위 FLOW_TOP 이름만 두고 나머지는 '<p>:*' 로 접는다
function foldTop(names: string[], p: 'a' | 'u') {
  const cnt = new Map<string, number>()
  for (const n of names) cnt.set(n, (cnt.get(n) ?? 0) + 1)
  const sorted = [...cnt].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )
  const keep = new Set(sorted.slice(0, FLOW_TOP).map(([n]) => n))
  return {
    id: (n: string) => (keep.has(n) ? `${p}:${n}` : `${p}:*`),
    fold: sorted.length - keep.size,
  }
}
export function sessFlow(cb: ActRow[], partial: boolean): SessFlow {
  if (!cb.length) return { ...EMPTY_FLOW, partial }
  const app = (r: ActRow) => r.appNm ?? ''
  const usr = (r: ActRow) => r.usename ?? '-'
  const fa = foldTop(cb.map(app), 'a')
  const fu = foldTop(cb.map(usr), 'u')
  const nv = new Map<string, number>()
  const lk = new Map<string, Map<string, number>>()
  const add = (s: string, t: string) => {
    const m = lk.get(s) ?? new Map<string, number>()
    m.set(t, (m.get(t) ?? 0) + 1)
    lk.set(s, m)
  }
  for (const r of cb) {
    const a = fa.id(app(r)),
      u = fu.id(usr(r)),
      st = `s:${flowState(r)}`
    for (const n of [a, u, st]) nv.set(n, (nv.get(n) ?? 0) + 1)
    add(a, u)
    add(u, st)
  }
  const col = (id: string) => 'aus'.indexOf(id[0])
  const stOrder = (id: string) =>
    id[0] === 's' ? FLOW_STATES.indexOf(id.slice(2) as FlowState) : 0
  const KIND = { a: 'app', u: 'user', s: 'state' } as const
  const nodes: FlowNode[] = [...nv]
    .sort(
      ([x, xv], [y, yv]) =>
        col(x) - col(y) || stOrder(x) - stOrder(y) || yv - xv,
    )
    .map(([id, value]) => {
      const star = id[0] !== 's' && id.slice(2) === '*'
      return {
        id,
        kind: KIND[id[0] as keyof typeof KIND],
        label: star ? '' : id.slice(2),
        value,
        ...(star ? { fold: id[0] === 'a' ? fa.fold : fu.fold } : {}),
      }
    })
  const links = [...lk].flatMap(([source, m]) =>
    [...m].map(([target, value]) => ({ source, target, value })),
  )
  return { nodes, links, partial }
}

// ── 게이지 구간 — Signal.thr(THR 파생) 그대로, stops = ECharts axisLine.color 비율(0~1). 바늘은 [min,max] clamp ──
export type GaugeScale = { min: number; max: number; stops: [number, Lvl][] }
export function gaugeScale(
  thr: NonNullable<Signal['thr']>,
  unit: Signal['unit'],
): GaugeScale {
  const max = thr.down || unit === 'pct' ? 100 : thr.risk * 1.5
  const min = thr.down ? Math.max(0, 2 * thr.risk - thr.warn) : 0
  const f = (v: number) =>
    max > min ? Math.min(1, Math.max(0, (v - min) / (max - min))) : 1
  return {
    min,
    max,
    stops: thr.down
      ? [
          [f(thr.risk), 'RISK'],
          [f(thr.warn), 'WARN'],
          [1, 'OK'],
        ]
      : [
          [f(thr.warn), 'OK'],
          [f(thr.risk), 'WARN'],
          [1, 'RISK'],
        ],
  }
}

// ── 레이더(범주 8축) — 축 점수 = 축 안 평가된 신호(OK·WARN·RISK) 중 최악의 SCORE, 평가 없음 = null·NA ──
export type RadarAxis =
  | 'avail'
  | 'sess'
  | 'lock'
  | 'perf'
  | 'store'
  | 'maint'
  | 'idx'
  | 'protect'
export const RADAR_AXES: Record<RadarAxis, SigId[]> = {
  avail: ['AVAIL', 'CONN_USE', 'URL'],
  sess: ['LONG_QRY', 'IDLE_TX'],
  lock: ['LOCK_WAIT'],
  perf: ['CACHE_HIT', 'XACT_ERR', 'SLOW_SQL'],
  store: ['STORAGE'],
  maint: ['VACUUM'],
  idx: ['INDEX'],
  protect: ['BACKUP', 'REPL'],
}
export const SCORE = { OK: 100, WARN: 60, RISK: 20 } as const
export const RADAR_SAFE = (SCORE.OK + SCORE.WARN) / 2 // 안전 기준선(점선) — 안쪽이면 주의 이상
export type RadarPt = { axis: RadarAxis; score: number | null; lvl: Lvl }
export function radarScores(lv: Partial<Record<SigId, Lvl>>): RadarPt[] {
  return (Object.keys(RADAR_AXES) as RadarAxis[]).map((axis) => {
    const ls = RADAR_AXES[axis]
      .map((id) => lv[id])
      .filter((l): l is keyof typeof SCORE => !!l && l in SCORE)
    if (!ls.length) return { axis, score: null, lvl: 'NA' as Lvl }
    const w = worst(ls) as keyof typeof SCORE
    return { axis, score: SCORE[w], lvl: w }
  })
}
// 현재 신호 → radarScores 입력. 설정성 사유(NO_LIMIT 등)는 summarize 처럼 판정에서 뺀다
export const sigLevels = (signals: Iterable<Signal>) =>
  Object.fromEntries(
    [...signals].filter((s) => !isSetup(s)).map((s) => [s.id, s.lvl]),
  ) as Partial<Record<SigId, Lvl>>

// ── URL(schema.pi 저장 이력, 접속 없이 연결만으로 판정) ──
export function evalUrl(urls: In<UrlCheck[]>, now: number) {
  const at = new Date(now).toISOString()
  if (typeof urls === 'string')
    return {
      signal: sig('URL', 'UNKNOWN', at, { reason: `LINK_${urls}` }),
      vals: {} as RuleVals,
    }
  const used = urls.filter((u) => u.useYn === 'Y')
  if (!used.length)
    return {
      signal: sig('URL', 'NA', at, { reason: 'NONE' }),
      vals: {} as RuleVals,
    }
  // 구간 안 점검 없음(chkCnt 0·lstSts null) 또는 마지막 점검 15분 초과 = 판정에서 뺌(실패 아님)
  const fresh = used.filter(
    (u) =>
      u.chkCnt > 0 &&
      u.stsNo !== null &&
      !(now - ts(u.lstDtm) > THR.urlStaleMs),
  )
  if (!fresh.length)
    return {
      signal: sig('URL', 'UNKNOWN', at, {
        reason: 'STALE',
        params: { stale: used.length },
      }),
      vals: {} as RuleVals,
    }
  const fail = fresh.filter((u) => u.stsNo === 0 || u.stsNo! >= 400)
  const maxRsp = Math.max(0, ...fresh.map((u) => u.rspMs ?? 0))
  const chk = fresh.reduce((s, u) => s + u.chkCnt, 0)
  const errPct =
    chk > 0 ? r2((fresh.reduce((s, u) => s + u.errCnt, 0) / chk) * 100) : 0
  const lvl: Lvl =
    fail.length >= 1 || maxRsp >= THR.urlMs[1]
      ? 'RISK'
      : errPct >= THR.urlErrPct || maxRsp >= THR.urlMs[0]
        ? 'WARN'
        : 'OK'
  const top = [...fresh]
    .sort(
      (a, b) =>
        Number(b.stsNo === 0 || b.stsNo! >= 400) -
          Number(a.stsNo === 0 || a.stsNo! >= 400) ||
        (b.rspMs ?? 0) - (a.rspMs ?? 0),
    )
    .slice(0, 5)
    .map((u) => ({
      key: u.url,
      label: cut(u.url),
      value: u.rspMs ?? 0,
      sub: String(u.stsNo),
      lvl:
        u.stsNo === 0 || u.stsNo! >= 400
          ? ('RISK' as Lvl)
          : up(u.rspMs ?? 0, THR.urlMs),
    }))
  return {
    signal: sig('URL', lvl, at, {
      value: fail.length,
      unit: 'cnt',
      thr: { warn: 1, risk: 1 },
      params: {
        n: fail.length,
        ms: maxRsp,
        errPct,
        stale: used.length - fresh.length,
      },
      top,
    }),
    vals: { URL_RSP_MS: maxRsp, URL_FAIL_CNT: fail.length } as RuleVals,
  }
}

// 한도 = 이 접속(또는 전체) 대상 DB_SIZE_MB 의 GT/GE 사용 규칙 중 최솟값(MB → 바이트). LT/LE·다른 접속 규칙은 한도가 아님
export function storageLimit(rules: Rule[], connId: string): number | null {
  const v = rules
    .filter(
      (r) =>
        r.useYn === 'Y' &&
        r.metricCd === 'DB_SIZE_MB' &&
        (r.opCd === 'GT' || r.opCd === 'GE') &&
        (!r.connId || r.connId === connId) &&
        r.thrVal > 0,
    )
    .map((r) => r.thrVal)
  return v.length ? Math.min(...v) * MIB : null
}

const UTIL_SQL =
  /^\s*(VACUUM|ANALYZE|COPY|CREATE|ALTER|REINDEX|BEGIN|COMMIT|ROLLBACK|SET|EXPLAIN|SHOW|DISCARD|RESET)\b/i

// 테이블 1개의 죽은 행·분석 지연 판정 — VACUUM 카드와 트리맵 색이 같은 함수를 쓴다(판정 갈라짐 방지)
export function rateDead(t: TblRow, now: number) {
  const deadPct =
    t.deadTup >= THR.deadMin
      ? r2((t.deadTup / Math.max(1, t.liveTup + t.deadTup)) * 100)
      : 0
  const anaAge = now - ts(t.lastAnalyze)
  const stale =
    t.modSinceAnalyze >= Math.max(1000, 0.5 * t.liveTup) && !(anaAge <= DAY)
  const vacOld = !(now - ts(t.lastVacuum) <= 7 * DAY)
  const lvl: Lvl =
    (deadPct >= THR.deadPct[1] && t.deadTup >= THR.deadRiskMin) ||
    (t.deadTup >= THR.deadHuge && vacOld)
      ? 'RISK'
      : deadPct >= THR.deadPct[0] || stale
        ? 'WARN'
        : 'OK'
  return { deadPct, stale, lvl }
}

// ── 트리맵(스키마 → 테이블) — sizes 면적 + tbl_stats 죽은 행 판정 색. 새 조회 없음 ──
export const TREE_SCHEMA_TOP = 6
export const TREE_TBL_TOP = 10
export type TreeNode = {
  id: string // 스키마 = schema, 테이블 = schema.rel, 접은 것 = '__other' · '<schema>.__other'
  name: string // 스키마명 / 테이블명(스키마 접두 없음) / '__other'
  value: number // 바이트
  deadPct: number | null // 실제 죽은 행 비율(툴팁·표용), 스키마·접은 것·통계 없음 = null
  lvl: Lvl
  fold?: number // 접힌 개체 수
  children?: TreeNode[]
}
export type SizeTree = { nodes: TreeNode[]; partial: boolean }
const sumV = (ns: TreeNode[]) => ns.reduce((a, n) => a + n.value, 0)
const byValue = (a: TreeNode, b: TreeNode) =>
  b.value - a.value || a.id.localeCompare(b.id)
// 상위 n 개 + 나머지 1개(접은 노드)
function foldNodes(ns: TreeNode[], n: number, id: string): TreeNode[] {
  const sorted = [...ns].sort(byValue)
  const rest = sorted.slice(n)
  if (!rest.length) return sorted
  return [
    ...sorted.slice(0, n),
    {
      id,
      name: '__other',
      value: sumV(rest),
      deadPct: null,
      lvl: worst(rest.map((x) => x.lvl)),
      fold: rest.length,
    },
  ]
}
export function sizeTree(
  sizes: In<SizeRow[]>,
  tbl: In<TblRow[]>,
  now: number,
): SizeTree {
  if (typeof sizes === 'string') return { nodes: [], partial: false }
  const tb = typeof tbl === 'string' ? [] : tbl
  const byRel = new Map(tb.map((t) => [`${t.schema}.${t.rel}`, t]))
  const bySch = new Map<string, TreeNode[]>()
  for (const s of sizes) {
    const id = `${s.schema}.${s.rel}`
    const t = byRel.get(id)
    const leaf: TreeNode = {
      id,
      name: s.rel,
      value: s.totalSz,
      deadPct: t
        ? r2((t.deadTup / Math.max(1, t.liveTup + t.deadTup)) * 100)
        : null,
      lvl: t ? rateDead(t, now).lvl : 'NA',
    }
    const ls = bySch.get(s.schema)
    if (ls) ls.push(leaf)
    else bySch.set(s.schema, [leaf])
  }
  const schemas = [...bySch].map(([sch, ls]): TreeNode => {
    const kids = foldNodes(ls, TREE_TBL_TOP, `${sch}.__other`)
    return {
      id: sch,
      name: sch,
      value: sumV(kids),
      deadPct: null,
      lvl: worst(kids.map((x) => x.lvl)),
      children: kids,
    }
  })
  return {
    nodes: foldNodes(schemas, TREE_SCHEMA_TOP, '__other'),
    partial: sizes.length >= MAX_ROWS || tb.length >= MAX_ROWS,
  }
}

// ── 느린 층(top_sql·tbl_stats·idx_stats·sizes·archiver·replication + schema.pi 요약·성능 수집 용량) ──
export function evalSlow(i: {
  topSql: In<TopRow[]>
  tbl: In<TblRow[]>
  idx: In<IdxRow[]>
  sizes: In<SizeRow[]>
  arc: In<ArcRow | null>
  repl: In<ReplRow[]>
  version: Version | null
  statsReset: string | null
  dbSzByte: In<number | null>
  summaryUrl: In<UrlCheck[]>
  capacity: Capacity
  now: number
}) {
  const at = new Date(i.now).toISOString()
  const out: Signal[] = []
  const u = evalUrl(i.summaryUrl, i.now)
  out.push(u.signal)

  // SLOW_SQL — 유틸 문장 제외, 순위·경보 = 1회 최고 시간(max_exec_time) 만(총 시간·평균 순 금지, 마스터 2026-11-02)
  // 호출 수 하한 없음 — DBeaver 1회성 수십 초 쿼리도 바로 악성
  let slowTop: BoardSlow['slowTop'] = []
  if (i.topSql === 'PGSS_MISSING')
    out.push(sig('SLOW_SQL', 'UNKNOWN', at, { reason: 'PGSS' }))
  else if (i.version?.versionNum != null && i.version.versionNum < 130000)
    out.push(sig('SLOW_SQL', 'UNKNOWN', at, { reason: 'VER' }))
  else if (typeof i.topSql === 'string')
    out.push(sig('SLOW_SQL', 'UNKNOWN', at, { reason: `LINK_${i.topSql}` }))
  else {
    const rows = i.topSql
      .filter((r) => !UTIL_SQL.test(r.query))
      .sort((a, b) => b.maxMs - a.maxMs)
    slowTop = rows.slice(0, 10).map((r) => ({
      key: r.queryid,
      label: cut(r.query),
      calls: r.calls,
      maxMs: r.maxMs,
      meanMs: r.meanMs,
    }))
    if (!rows.length) out.push(sig('SLOW_SQL', 'NA', at, { reason: 'NONE' }))
    else {
      const w = rows[0]
      out.push(
        sig('SLOW_SQL', up(w.maxMs, THR.slowMs), at, {
          value: r2(w.maxMs),
          unit: 'ms',
          thr: { warn: THR.slowMs[0], risk: THR.slowMs[1] },
          params: {
            ms: Math.round(w.maxMs),
            ...(i.statsReset ? { since: i.statsReset } : {}),
            basis: 'stored',
          },
          top: slowTop.slice(0, 5).map((r) => ({
            key: r.key,
            label: r.label,
            value: r.maxMs,
            sub: `calls ${r.calls} · max ${r2(r.maxMs)}ms`, // 언어 중립(pg_stat_statements 칼럼명)
            lvl: up(r.maxMs, THR.slowMs),
          })),
        }),
      )
    }
  }

  // STORAGE — 한도(내 규칙) 있으면 사용률·도달 예상일, 없으면 크기·증가량만(판정 OK + NO_LIMIT 설정 안내)
  if (typeof i.dbSzByte === 'string')
    out.push(sig('STORAGE', 'UNKNOWN', at, { reason: `LINK_${i.dbSzByte}` }))
  else if (i.dbSzByte === null)
    out.push(sig('STORAGE', 'UNKNOWN', at, { reason: 'SAMPLE' }))
  else {
    const { limitByte, perDay, daysLeft } = i.capacity
    const base = {
      gb: r2(i.dbSzByte / 1024 ** 3),
      ...(perDay !== null ? { perDayMb: r2(perDay / MIB) } : {}),
    }
    if (!limitByte)
      out.push(
        sig('STORAGE', 'OK', at, {
          value: i.dbSzByte,
          unit: 'byte',
          reason: 'NO_LIMIT',
          params: base,
        }),
      )
    else {
      const pct = r2((i.dbSzByte / limitByte) * 100)
      const days = daysLeft === null ? null : Math.floor(daysLeft)
      const l = worst([
        up(pct, THR.storePct),
        days === null
          ? 'OK'
          : days <= THR.storeDays[1]
            ? 'RISK'
            : days <= THR.storeDays[0]
              ? 'WARN'
              : 'OK',
      ])
      out.push(
        sig('STORAGE', l, at, {
          value: pct,
          unit: 'pct',
          thr: { warn: THR.storePct[0], risk: THR.storePct[1] },
          params: {
            ...base,
            limitGb: r2(limitByte / 1024 ** 3),
            ...(days !== null ? { days } : {}),
          },
        }),
      )
    }
  }

  // VACUUM — 죽은 행 비율·분석 지연
  if (typeof i.tbl === 'string')
    out.push(sig('VACUUM', 'UNKNOWN', at, { reason: `LINK_${i.tbl}` }))
  else if (!i.tbl.length) out.push(sig('VACUUM', 'NA', at, { reason: 'NONE' }))
  else {
    const rated = i.tbl
      .map((t) => ({ t, ...rateDead(t, i.now) }))
      .filter((x) => x.lvl !== 'OK')
      .sort(
        (a, b) =>
          LVL_RANK[b.lvl] - LVL_RANK[a.lvl] ||
          b.deadPct - a.deadPct ||
          b.t.deadTup - a.t.deadTup,
      )
    const w = rated[0]
    out.push(
      sig('VACUUM', w?.lvl ?? 'OK', at, {
        value: w ? w.deadPct : 0,
        unit: 'pct',
        thr: { warn: THR.deadPct[0], risk: THR.deadPct[1] },
        partial: i.tbl.length >= MAX_ROWS,
        params: { tbl: w ? `${w.t.schema}.${w.t.rel}` : '', n: rated.length },
        top: rated.slice(0, 10).map((x) => ({
          key: `${x.t.schema}.${x.t.rel}`,
          label: `${x.t.schema}.${x.t.rel}`,
          value: x.t.deadTup,
          sub: x.stale ? `${x.deadPct}%·analyze` : `${x.deadPct}%`,
          lvl: x.lvl,
        })),
      }),
    )
  }

  // INDEX — 무효 인덱스·미사용(통계 7일 이상 누적일 때만)·전체 스캔 과다(perf HEALTH 와 같은 기준)
  if (typeof i.idx === 'string' || typeof i.tbl === 'string')
    out.push(
      sig('INDEX', 'UNKNOWN', at, {
        reason: `LINK_${typeof i.idx === 'string' ? i.idx : i.tbl}`,
      }),
    )
  else {
    const recent = i.now - ts(i.statsReset) < 7 * DAY
    const invalid = i.idx.filter((x) => !x.valid)
    const unused = recent
      ? []
      : i.idx.filter(
          (x) =>
            x.idxScan === 0 && !x.uniq && !x.pk && x.idxSz >= THR.unusedIdxByte,
        )
    const seq = i.tbl
      .map((t) => ({
        t,
        ratio: t.seqScan / Math.max(1, t.seqScan + t.idxScan),
      }))
      .filter(
        (x) =>
          x.t.liveTup >= THR.seqLive &&
          x.t.seqScan >= THR.seqMin &&
          x.ratio >= THR.seqRatio,
      )
    const seqRisk = seq.some(
      (x) =>
        x.t.liveTup >= THR.seqRisk.live &&
        x.ratio >= THR.seqRisk.ratio &&
        x.t.seqTupRead >= THR.seqRisk.tupRead,
    )
    let lvl: Lvl =
      invalid.length || seqRisk
        ? 'RISK'
        : unused.length || seq.length
          ? 'WARN'
          : 'OK'
    const reason = lvl === 'OK' && recent ? 'RESET' : null
    if (reason) lvl = 'UNKNOWN'
    const top: TopItem[] = [
      ...invalid.map((x) => ({
        key: `${x.schema}.${x.idx}`,
        label: `${x.schema}.${x.idx}`,
        value: x.idxSz,
        sub: 'invalid',
        lvl: 'RISK' as Lvl,
      })),
      ...seq
        .sort((a, b) => b.t.seqTupRead - a.t.seqTupRead)
        .map((x) => ({
          key: `${x.t.schema}.${x.t.rel}`,
          label: `${x.t.schema}.${x.t.rel}`,
          value: x.t.seqTupRead,
          sub: 'seq',
          lvl: 'WARN' as Lvl,
        })),
      ...unused
        .sort((a, b) => b.idxSz - a.idxSz)
        .map((x) => ({
          key: `${x.schema}.${x.idx}`,
          label: `${x.schema}.${x.idx}`,
          value: x.idxSz,
          sub: 'unused',
          lvl: 'WARN' as Lvl,
        })),
    ]
    out.push(
      sig('INDEX', lvl, at, {
        value: invalid.length + unused.length + seq.length,
        unit: 'cnt',
        reason,
        partial: i.idx.length >= MAX_ROWS || i.tbl.length >= MAX_ROWS,
        params: {
          n: invalid.length + unused.length + seq.length,
          invalid: invalid.length,
          unused: unused.length,
          seq: seq.length,
          unusedMb: r2(unused.reduce((s, x) => s + x.idxSz, 0) / MIB),
          ...(i.statsReset ? { since: i.statsReset } : {}),
        },
        top: top.slice(0, 10),
      }),
    )
  }

  // BACKUP — ops backupChecks 와 같은 규칙(설정 목록 없이 archiver 만)
  if (i.version?.inRecovery === true)
    out.push(sig('BACKUP', 'NA', at, { reason: 'STANDBY' }))
  else if (typeof i.arc === 'string')
    out.push(sig('BACKUP', 'UNKNOWN', at, { reason: `LINK_${i.arc}` }))
  else if (!i.arc) out.push(sig('BACKUP', 'UNKNOWN', at, { reason: 'GRANT' }))
  else {
    const mode = i.arc.archiveMode ?? ''
    const last = ts(i.arc.lastArchivedTime)
    const failAt = ts(i.arc.lastFailedTime)
    const failing =
      !Number.isNaN(failAt) && (Number.isNaN(last) || failAt > last)
    const on = mode === 'on' || mode === 'always'
    const lvl: Lvl =
      !on || failing
        ? 'RISK'
        : Number.isNaN(last) || i.now - last > DAY
          ? 'WARN'
          : 'OK'
    out.push(
      sig('BACKUP', lvl, at, {
        value: Number.isNaN(last) ? null : Math.round((i.now - last) / HOUR),
        unit: '',
        params: {
          mode: mode || '-',
          failed: i.arc.failedCount,
          ...(i.arc.lastArchivedTime ? { last: i.arc.lastArchivedTime } : {}),
        },
      }),
    )
  }

  // REPL — 대기 서버 지연(replay_lag)·바이트 지연(sent_lsn − replay_lsn; primary 현재 LSN 은 조회 수단 없음)
  if (i.version?.inRecovery === true)
    out.push(sig('REPL', 'NA', at, { reason: 'STANDBY' }))
  else if (typeof i.repl === 'string')
    out.push(sig('REPL', 'UNKNOWN', at, { reason: `LINK_${i.repl}` }))
  else if (!i.repl.length) out.push(sig('REPL', 'NA', at, { reason: 'NONE' }))
  else if (i.repl.every((r) => r.state === null))
    out.push(sig('REPL', 'UNKNOWN', at, { reason: 'GRANT', partial: true }))
  else {
    const rs = i.repl.map((r) => {
      const lagSec = intervalSec(r.replayLag) ?? 0 // null = 유휴(변경 없음)
      const bytes =
        r.sentLsn && r.replayLsn ? Number(lsnDiff(r.sentLsn, r.replayLsn)) : 0
      const lvl: Lvl =
        r.state !== 'streaming' || lagSec >= THR.replSec[1]
          ? 'RISK'
          : lagSec >= THR.replSec[0] || bytes >= THR.replBytes
            ? 'WARN'
            : 'OK'
      return { r, lagSec, bytes, lvl }
    })
    const w = rs.reduce((a, b) =>
      LVL_RANK[b.lvl] > LVL_RANK[a.lvl] ||
      (b.lvl === a.lvl && b.lagSec > a.lagSec)
        ? b
        : a,
    )
    out.push(
      sig('REPL', w.lvl, at, {
        value: r2(w.lagSec),
        unit: 'sec',
        thr: { warn: THR.replSec[0], risk: THR.replSec[1] },
        params: {
          sec: Math.round(w.lagSec),
          n: rs.length,
          state: w.r.state ?? '-',
        },
        top: rs.slice(0, 10).map((x) => ({
          key: x.r.appNm ?? '-',
          label: x.r.appNm || '-',
          value: x.lagSec,
          sub: `${x.r.state ?? '-'}·${r2(x.bytes / MIB)}MB`,
          lvl: x.lvl,
        })),
      }),
    )
  }

  const sizeTop =
    typeof i.sizes === 'string'
      ? []
      : i.sizes.slice(0, 10).map((s) => ({
          label: `${s.schema}.${s.rel}`,
          tblByte: s.tblSz,
          otherByte: s.idxSz + s.toastSz,
        }))
  const vals: RuleVals = {
    ...u.vals,
    DB_SIZE_MB: typeof i.dbSzByte === 'number' ? r2(i.dbSzByte / MIB) : null,
  }
  return {
    signals: out,
    slowTop,
    sizeTop,
    tree: sizeTree(i.sizes, i.tbl, i.now),
    vals,
  }
}

// ── 요약·할 일 ──
export const isSetup = (s: Signal) => !!s.reason && SETUP.has(s.reason)

export function summarize(signals: Signal[]) {
  const judged = signals.filter((s) => !isSetup(s))
  const c = (l: Lvl) => judged.filter((s) => s.lvl === l).length
  const w = worst(judged.map((s) => s.lvl))
  return {
    overall: (w === 'NA' ? 'UNKNOWN' : w) as Lvl,
    risk: c('RISK'),
    warn: c('WARN'),
    ok: c('OK'),
    unknown: c('UNKNOWN'),
    na: c('NA'),
    setup: signals.length - judged.length,
    cascade: signals.some((s) => s.reason === 'CONN_DOWN'),
  }
}

// 할 일 = RISK → WARN, 범주 순(가용 > 부하 > 보호 > 효율 > 저장), DB 다운이면 AVAIL 1건만. setup = 설정하면 볼 수 있는 신호
export function todo(signals: Signal[], limit = 5) {
  const setup = signals.filter(isSetup)
  if (signals.some((s) => s.reason === 'CONN_DOWN')) {
    const a = signals.filter((s) => s.id === 'AVAIL' && s.lvl === 'RISK')
    return { items: a, more: 0, setup }
  }
  const all = signals
    .filter((s) => s.lvl === 'RISK' || s.lvl === 'WARN')
    .sort(
      (a, b) =>
        LVL_RANK[b.lvl] - LVL_RANK[a.lvl] ||
        CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat) ||
        SIG_IDS.indexOf(a.id) - SIG_IDS.indexOf(b.id),
    )
  return {
    items: all.slice(0, limit),
    more: Math.max(0, all.length - limit),
    setup,
  }
}

// ── 사용자 규칙(dbm_mon_rule) — 위반 = 해당 신호 RISK 승격 + params.rule. APP_* 는 보조 영역 몫이라 여기서 안 씀 ──
const RULE_SIG: Partial<Record<MetricCd, SigId>> = {
  DB_SESS_CNT: 'CONN_USE',
  DB_LOCK_WAIT_CNT: 'LOCK_WAIT',
  DB_CACHE_HIT_PCT: 'CACHE_HIT',
  DB_SIZE_MB: 'STORAGE',
  URL_RSP_MS: 'URL',
  URL_FAIL_CNT: 'URL',
}
// 보드가 실제로 평가하는 규칙 지표(규칙 화면 선택지·'평가 안 됨' 표시의 단일 소스)
export const isRuleEvaluated = (m: MetricCd) => m in RULE_SIG
// rules.ts compare 와 같은 의미(런타임 import 금지 규약으로 복제)
const cmp = (v: number, op: Rule['opCd'], t: number) =>
  op === 'GT' ? v > t : op === 'GE' ? v >= t : op === 'LT' ? v < t : v <= t

export function applyRules(
  signals: Signal[],
  rules: Rule[],
  ctx: { connId: string | null; vals: RuleVals },
): Signal[] {
  const hits = new Map<SigId, string[]>()
  for (const r of rules) {
    const id = RULE_SIG[r.metricCd]
    if (!id || r.useYn !== 'Y') continue
    if (r.metricCd.startsWith('DB_') && r.connId && r.connId !== ctx.connId)
      continue // 다른 접속 규칙 무시
    const v = ctx.vals[r.metricCd]
    if (v === null || v === undefined || !cmp(v, r.opCd, r.thrVal)) continue
    hits.set(id, [
      ...(hits.get(id) ?? []),
      `${r.metricCd} ${r.opCd} ${r.thrVal}`,
    ])
  }
  return signals.map((s) => {
    const h = hits.get(s.id)
    return h
      ? {
          ...s,
          lvl: 'RISK',
          reason: s.lvl === 'NA' || s.lvl === 'UNKNOWN' ? null : s.reason,
          params: { ...s.params, rule: h.join(', ') },
        }
      : s
  })
}

// ── 추이 이력(dbm_mon_snap) ──
type PairD = {
  t: number
  dtSec: number
  cmt: number | null
  rlbk: number | null
  hit: number | null
  read: number | null
  dlck: number | null
} | null
function pair(a: SnapRow | undefined, b: SnapRow): PairD {
  if (!a) return null
  const dt = ts(b.bkt_dtm) - ts(a.bkt_dtm)
  if (
    !(dt > 0) ||
    dt > PREV_MAX_MS ||
    !sameT(a.stat_reset_dtm, b.stat_reset_dtm)
  )
    return null
  return {
    t: ts(b.bkt_dtm),
    dtSec: dt / 1000,
    cmt: dlt(b.xact_cmt_cnt, a.xact_cmt_cnt),
    rlbk: dlt(b.xact_rlbk_cnt, a.xact_rlbk_cnt),
    hit: dlt(b.blks_hit_cnt, a.blks_hit_cnt),
    read: dlt(b.blks_read_cnt, a.blks_read_cnt),
    dlck: dlt(b.dlck_cnt, a.dlck_cnt),
  }
}

// 행마다 1점(첫 행·통계 초기화·음수·간격 10분 초과 = null) — 화면 차트 P4·P5
export function deltas(rows: SnapRow[]) {
  return rows.map((b, k) => {
    const d = pair(rows[k - 1], b)
    const x = d && d.cmt !== null && d.rlbk !== null ? d.cmt + d.rlbk : null
    const hr = d && d.hit !== null && d.read !== null ? d.hit + d.read : null
    return {
      t: ts(b.bkt_dtm),
      tps: d && x !== null ? r2(x / d.dtSec) : null,
      // 표본 하한(SAMPLE) 미만 = null — 카드·히트맵과 같은 기준(한산한 분의 거짓 급등·0% 점 방지)
      rlbkPct:
        d && x !== null && x >= SAMPLE.xact ? r2((d.rlbk! / x) * 100) : null,
      cachePct:
        d && hr !== null && hr >= SAMPLE.blks ? r2((d.hit! / hr) * 100) : null,
      dlck: d ? d.dlck : null,
    }
  })
}

export const HEAT_ROWS = [
  'CONN_USE',
  'CACHE_HIT',
  'LOCK_WAIT',
  'LONG_QRY',
  'IDLE_TX',
  'XACT_ERR',
] as const satisfies readonly SigId[]
export const HEAT_BKT_MIN: Record<Range, number> = {
  30: 5,
  60: 5,
  360: 15,
  1440: 60,
}

// 스냅샷 1행의 축약 판정(히트맵 칸·레이더 '1시간 전' 공용) — prev = 바로 앞 행(Δ 용)
export function rowLevels(
  prev: SnapRow | undefined,
  r: SnapRow,
): Record<(typeof HEAT_ROWS)[number], Lvl> {
  const d = pair(prev, r)
  const hr = d && d.hit !== null && d.read !== null ? d.hit + d.read : 0
  const x = d && d.cmt !== null && d.rlbk !== null ? d.cmt + d.rlbk : 0
  return {
    CONN_USE: r.max_conn_cnt
      ? up((r.sess_cnt / r.max_conn_cnt) * 100, THR.connPct)
      : 'NA',
    CACHE_HIT:
      hr >= SAMPLE.blks ? down((d!.hit! / hr) * 100, THR.cachePct) : 'NA',
    LOCK_WAIT:
      r.lock_wait_cnt >= THR.lockWaiters
        ? 'RISK'
        : r.lock_wait_cnt >= 1
          ? 'WARN'
          : 'OK',
    LONG_QRY: up(r.max_run_ms, THR.longMs),
    IDLE_TX: up(r.max_idle_tx_ms, THR.idleMs),
    XACT_ERR: worst([
      x >= SAMPLE.xact ? up((d!.rlbk! / x) * 100, THR.rlbkPct) : 'NA',
      d && d.dlck !== null ? up(d.dlck, THR.dlck) : 'NA',
    ]),
  }
}

// 히트맵(신호 × 시간 구간) — 저장 칼럼만 쓰는 축약 규칙(카드 판정과 다름 : 락은 대기 수만, Δ 는 표본 충분할 때만), 구간 대표값 = 최악, 빈 구간 = NA
export function levelsByBucket(
  rows: SnapRow[],
  range: Range,
  now = Date.now(),
) {
  const bkt = HEAT_BKT_MIN[range] * 60_000
  const n = Math.round((range * 60_000) / bkt)
  const first = Math.floor(now / bkt) * bkt - (n - 1) * bkt
  const cols = Array.from({ length: n }, (_, k) =>
    new Date(first + k * bkt).toISOString(),
  )
  const cells: Lvl[][] = HEAT_ROWS.map(() => Array<Lvl>(n).fill('NA'))
  rows.forEach((r, k) => {
    const c = Math.floor((ts(r.bkt_dtm) - first) / bkt)
    if (c < 0 || c >= n) return
    const lv = rowLevels(rows[k - 1], r)
    HEAT_ROWS.forEach((id, ri) => {
      cells[ri][c] = worst([cells[ri][c], lv[id]])
    })
  })
  return { rows: [...HEAT_ROWS] as SigId[], cols, cells }
}

// ── 보조 ──
// pg_lsn 'X/Y'(16진) 차이(바이트)
export const lsnDiff = (a: string, b: string): bigint => {
  const v = (s: string) => {
    const [hi, lo] = s.split('/')
    return (BigInt('0x' + (hi || '0')) << 32n) + BigInt('0x' + (lo || '0'))
  }
  return v(a) - v(b)
}
// interval 텍스트('00:00:01.5', '1 day 02:00:00') → 초 — ops/params.ts intervalSec 와 같은 구현(런타임 import 금지 규약으로 복제)
export function intervalSec(v: string | null): number | null {
  if (!v) return null
  const m = /^(?:(-?\d+) days? ?)?(-?)(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(
    v.trim(),
  )
  if (!m) return null
  const sec = Number(m[3]) * 3600 + Number(m[4]) * 60 + Number(m[5])
  return Number(m[1] ?? 0) * 86400 + (m[2] ? -sec : sec)
}
