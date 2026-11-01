// 모니터링 관문 보드 서버 공용 — 이름 붙인 조회 결과 파싱·모듈 캐시·빠른/느린 층 조립·스냅샷(dbm_mon_snap, sql/031) 쓰기·사용자 규칙 읽기
//  사용 : /api/monitor/board 라우트가 buildFast/buildSlow 를 부르고, 캐시 미스 + 세 조회 성공일 때만 after(() => writeSnap(...))
import 'server-only'
import { db } from '@/lib/api'
import {
  LinkError,
  linkGet,
  linkQuery,
  type QueryName,
  type QueryResult,
} from '@/lib/link/client'
import { normalizeSummary, RULE_MAX, type Rule } from '@/lib/monitor/rules'
import {
  applyRules,
  evalFast,
  evalSlow,
  evalUrl,
  isLockWaiter,
  storageLimit,
  type ActRow,
  type ArcRow,
  type BoardFast,
  type BoardSlow,
  type Capacity,
  type DbStats,
  type IdxRow,
  type LockRow,
  type ReplRow,
  type SizeRow,
  type SnapInsert,
  type SnapRow,
  type SnapVals,
  type TblRow,
  type TopRow,
  type Version,
} from '@/lib/monitor/signals'
import { forecast } from '@/lib/perf/calc'
import { num, numOrNull, pick, str, toObjs, type Obj } from '@/lib/perf/server'

// ── 모듈 캐시(인스턴스 로컬, best-effort) — 여러 탭·사용자가 토큰 분당 60회를 나눠 쓰므로. 소유 확인(linkGate) 통과 뒤에만 읽는다 ──
export const TTL = { fast: 50_000, slow: 270_000, slowPartial: 30_000 } // slowPartial = 일부 조회 실패(errors 있음) 결과는 짧게
const FORCE_MIN_MS = 10_000 // ?force=1 이어도 10초 안 재요청은 캐시(RATE 보호)
const CACHE_MAX = 200
type Ent = { at: number; exp: number; val: unknown }
const CACHE = new Map<string, Ent>()
export const cacheKey = (
  linkId: string,
  connId: string | null,
  tier: 'fast' | 'slow',
) => `${linkId}:${connId ?? ''}:${tier}`
export function cacheGet<T>(key: string, force = false): T | null {
  const e = CACHE.get(key)
  const now = Date.now()
  if (!e || now > e.exp) {
    if (e) CACHE.delete(key)
    return null
  }
  return force && now - e.at >= FORCE_MIN_MS ? null : (e.val as T)
}
export function cacheSet(key: string, ttl: number, val: unknown) {
  const now = Date.now()
  if (CACHE.size >= CACHE_MAX) {
    for (const [k, e] of CACHE) if (now > e.exp) CACHE.delete(k)
    if (CACHE.size >= CACHE_MAX)
      CACHE.delete(CACHE.keys().next().value as string) // 가장 오래 넣은 것
  }
  CACHE.set(key, { at: now, exp: now + ttl, val })
}

// ── 파싱(schema.pi cell : bigint·numeric = 문자열, 배열·객체 = JSON 문자열, boolean·날짜 ISO 그대로) ──
const bool = (v: unknown) => v === true || v === 't' || v === 'true'
const s = (v: unknown) => str(v) ?? ''
const maxT = (a: unknown, b: unknown) => {
  const x = str(a),
    y = str(b)
  if (!x || !y) return x ?? y
  return Date.parse(x) >= Date.parse(y) ? x : y
}
function intArr(v: unknown): number[] {
  if (Array.isArray(v)) return v.map(Number).filter(Number.isFinite)
  if (typeof v !== 'string' || !v) return []
  try {
    const j = JSON.parse(v)
    if (Array.isArray(j)) return j.map(Number).filter(Number.isFinite)
  } catch {}
  return v
    .replace(/[{}[\]]/g, '')
    .split(',')
    .map(Number)
    .filter((x) => x && Number.isFinite(x)) // PG 배열 리터럴 '{1,2}'
}
const one = (r: QueryResult): Obj => toObjs(r)[0] ?? {}

export function parseDbStats(r: QueryResult): DbStats {
  const o = one(r)
  return {
    ms: num(r.ms),
    xactCmt: numOrNull(o.xact_commit),
    xactRlbk: numOrNull(o.xact_rollback),
    blksHit: numOrNull(o.blks_hit),
    blksRead: numOrNull(o.blks_read),
    cachePct: numOrNull(o.cache_hit_pct),
    deadlocks: numOrNull(o.deadlocks),
    tempBytes: numOrNull(o.temp_bytes),
    dbSz: numOrNull(pick(o, 'db_sz', 'db_size')),
    statsReset: str(o.stats_reset),
  }
}
export const parseActivity = (r: QueryResult): ActRow[] =>
  toObjs(r).map((o) => ({
    pid: num(o.pid),
    usename: str(o.usename),
    appNm: str(o.application_name),
    backendType: str(o.backend_type),
    state: str(o.state),
    waitType: str(o.wait_event_type),
    xactStart: str(o.xact_start),
    queryStart: str(o.query_start),
    runMs: numOrNull(o.run_ms),
    query: str(o.query),
  }))
export function parseVersion(r: QueryResult): Version {
  const o = one(r)
  return {
    versionNum: numOrNull(o.version_num),
    inRecovery: o.in_recovery == null ? null : bool(o.in_recovery),
    startDtm: str(o.start_dtm),
    maxConn: numOrNull(o.max_conn),
  }
}
export const parseLocks = (r: QueryResult): LockRow[] =>
  toObjs(r).map((o) => ({
    pid: num(o.pid),
    granted: bool(o.granted),
    blockedBy: intArr(o.blocked_by),
    relNm: str(o.rel_nm),
  }))
export const parseTopSql = (r: QueryResult): TopRow[] =>
  toObjs(r).map((o) => ({
    queryid: s(o.queryid),
    query: s(o.query),
    calls: num(o.calls),
    totalMs: num(o.total_ms),
    meanMs: num(o.mean_ms),
  }))
export const parseTbl = (r: QueryResult): TblRow[] =>
  toObjs(r).map((o) => ({
    schema: s(o.schemaname),
    rel: s(o.relname),
    seqScan: num(o.seq_scan),
    seqTupRead: num(o.seq_tup_read),
    idxScan: num(o.idx_scan),
    liveTup: num(o.n_live_tup),
    deadTup: num(o.n_dead_tup),
    modSinceAnalyze: num(o.n_mod_since_analyze),
    lastVacuum: maxT(o.last_vacuum, o.last_autovacuum),
    lastAnalyze: maxT(o.last_analyze, o.last_autoanalyze),
  }))
export const parseIdx = (r: QueryResult): IdxRow[] =>
  toObjs(r).map((o) => ({
    schema: s(o.schemaname),
    rel: s(o.relname),
    idx: s(o.indexrelname),
    idxScan: num(o.idx_scan),
    idxSz: num(o.idx_sz),
    uniq: bool(o.indisunique),
    pk: bool(o.indisprimary),
    valid: o.indisvalid == null ? true : bool(o.indisvalid),
  }))
export const parseSizes = (r: QueryResult): SizeRow[] =>
  toObjs(r).map((o) => ({
    schema: s(o.schemaname),
    rel: s(o.relname),
    tblSz: num(o.tbl_sz),
    idxSz: num(o.idx_sz),
    toastSz: num(o.toast_sz),
    totalSz:
      numOrNull(o.total_sz) ?? num(o.tbl_sz) + num(o.idx_sz) + num(o.toast_sz),
  }))
export function parseArc(r: QueryResult): ArcRow | null {
  const o = toObjs(r)[0]
  if (!o) return null
  return {
    archivedCount: num(o.archived_count),
    lastArchivedTime: str(o.last_archived_time),
    failedCount: num(o.failed_count),
    lastFailedTime: str(o.last_failed_time),
    archiveMode: str(o.archive_mode),
  }
}
export const parseRepl = (r: QueryResult): ReplRow[] =>
  toObjs(r).map((o) => ({
    appNm: str(o.application_name),
    state: str(o.state),
    sentLsn: str(o.sent_lsn),
    replayLsn: str(o.replay_lsn),
    replayLag: str(o.replay_lag),
  }))

// ── 조회 실행 — LinkError 는 값으로, 그 밖 예외는 그대로(dbRoute 500) ──
const run = (
  linkId: string,
  connId: string,
  q: QueryName,
  params?: Record<string, unknown>,
): Promise<QueryResult | LinkError> =>
  linkQuery(linkId, connId, q, params).catch((e: unknown) => {
    if (e instanceof LinkError) return e
    throw e
  })
const val = <T>(
  r: QueryResult | LinkError,
  parse: (x: QueryResult) => T,
): T | string => (r instanceof LinkError ? r.code : parse(r))
// 모니터 경로 오류(대상 DB 판정이 아님) — 세 조회가 모두 같은 코드면 보드 대신 오류 응답(화면 빈 상태 문구)
const PATH_CODES = new Set([
  'LINK_AUTH',
  'LINK_DOWN',
  'LINK_NOT_FOUND',
  'LINK_SCOPE',
  'RATE',
  'CONN_UNSUPPORTED',
  'CONN_DISABLED',
  'DB_UNAVAILABLE',
])
function pathFail(rs: unknown[]): LinkError | null {
  const errs = rs.filter((r): r is LinkError => r instanceof LinkError)
  return errs.length === rs.length &&
    errs.length > 0 &&
    PATH_CODES.has(errs[0].code) &&
    errs.every((e) => e.code === errs[0].code)
    ? errs[0]
    : null
}

// ── 앱 DB 읽기 ──
type RuleRow = {
  rule_id: string
  metric_cd: Rule['metricCd']
  conn_id: string | null
  op_cd: Rule['opCd']
  thr_val: number | string
  use_yn: 'Y' | 'N'
}
// 규칙 읽기 실패는 보드를 막지 않는다(기본 판정만)
async function loadRules(linkId: string): Promise<Rule[]> {
  const { data, error } = await db()
    .from('dbm_mon_rule')
    .select('rule_id, metric_cd, conn_id, op_cd, thr_val, use_yn')
    .eq('lnk_id', linkId)
    .eq('use_yn', 'Y')
    .eq('del_yn', 'N')
    .limit(RULE_MAX)
  if (error) {
    console.error('[monitor] rules', error.code, error.message)
    return []
  }
  return (data as RuleRow[]).map((r) => ({
    ruleId: r.rule_id,
    metricCd: r.metric_cd,
    connId: r.conn_id,
    opCd: r.op_cd,
    thrVal: Number(r.thr_val),
    useYn: r.use_yn,
  }))
}

export const SNAP_COLS =
  'bkt_dtm, stat_reset_dtm, sess_cnt, actv_sess_cnt, idle_tx_sess_cnt, lock_wait_cnt, long_qry_cnt, max_run_ms, max_idle_tx_ms, xact_cmt_cnt, xact_rlbk_cnt, blks_hit_cnt, blks_read_cnt, dlck_cnt, db_sz_byte, max_conn_cnt'
// BIGINT 가 문자열로 와도 숫자로
export const toSnapRow = (r: Record<string, unknown>): SnapRow => ({
  bkt_dtm: String(r.bkt_dtm),
  stat_reset_dtm: str(r.stat_reset_dtm),
  sess_cnt: num(r.sess_cnt),
  actv_sess_cnt: num(r.actv_sess_cnt),
  idle_tx_sess_cnt: num(r.idle_tx_sess_cnt),
  lock_wait_cnt: num(r.lock_wait_cnt),
  long_qry_cnt: num(r.long_qry_cnt),
  max_run_ms: num(r.max_run_ms),
  max_idle_tx_ms: num(r.max_idle_tx_ms),
  xact_cmt_cnt: numOrNull(r.xact_cmt_cnt),
  xact_rlbk_cnt: numOrNull(r.xact_rlbk_cnt),
  blks_hit_cnt: numOrNull(r.blks_hit_cnt),
  blks_read_cnt: numOrNull(r.blks_read_cnt),
  dlck_cnt: numOrNull(r.dlck_cnt),
  db_sz_byte: numOrNull(r.db_sz_byte),
  max_conn_cnt: numOrNull(r.max_conn_cnt),
})

// 직전 스냅샷 1행(Δ 용) — 실패는 null(누적 판정으로 폴백)
async function lastSnap(
  linkId: string,
  connId: string,
): Promise<SnapRow | null> {
  const { data, error } = await db()
    .from('dbm_mon_snap')
    .select(SNAP_COLS)
    .eq('lnk_id', linkId)
    .eq('conn_id', connId)
    .eq('del_yn', 'N')
    .order('bkt_dtm', { ascending: false })
    .limit(1)
  if (error) console.error('[monitor] snap', error.code, error.message)
  return data?.[0] ? toSnapRow(data[0] as Record<string, unknown>) : null
}

// 용량 시계열 — /api/perf/trend 와 같은 조회(30일·200점, dbm_prf_clct)
// ponytail: trend 라우트와 10줄 중복 — 세 번째 소비자가 생기면 perf/server.ts 로 추출
async function sizePoints(
  linkId: string,
  connId: string,
): Promise<{ t: number; bytes: number }[]> {
  const { data, error } = await db()
    .from('dbm_prf_clct')
    .select('clct_dtm, db_sz_byte')
    .eq('lnk_id', linkId)
    .eq('conn_id', connId)
    .eq('del_yn', 'N')
    .not('db_sz_byte', 'is', null)
    .gte('clct_dtm', new Date(Date.now() - 30 * 86_400_000).toISOString())
    .order('clct_dtm', { ascending: false })
    .limit(200)
  if (error) {
    console.error('[monitor] clct', error.code, error.message)
    return []
  }
  return data
    .map((r) => ({
      t: new Date(r.clct_dtm).getTime(),
      bytes: Number(r.db_sz_byte),
    }))
    .reverse()
}

// ── 빠른 층 ──
export type FastHit = {
  res: BoardFast
  ver: Version | null
  dbSz: number | null
  statsReset: string | null
}

export async function buildFast(
  linkId: string,
  connId: string,
  now = Date.now(),
): Promise<{ hit: FastHit; snap: SnapVals | null } | LinkError> {
  // R-P1 — 세 조회·직전 스냅샷·규칙은 서로 독립
  const [dsR, actR, verR, prev, rules] = await Promise.all([
    run(linkId, connId, 'db_stats'),
    run(linkId, connId, 'activity'),
    run(linkId, connId, 'version'),
    lastSnap(linkId, connId),
    loadRules(linkId),
  ])
  const pf = pathFail([dsR, actR, verR])
  if (pf) return pf
  const ds = val(dsR, parseDbStats)
  const act = val(actR, parseActivity)
  const ver = val(verR, parseVersion)
  // 락 대기가 있을 때만 locks(앞 결과에 종속된 await — 허용)
  let locks: LockRow[] | null = null
  let locksErr: string | null = null
  if (typeof act !== 'string' && act.some(isLockWaiter)) {
    const l = await run(linkId, connId, 'locks')
    if (l instanceof LinkError) locksErr = l.code
    else locks = parseLocks(l)
  }
  const e = evalFast({
    dbStats: ds,
    activity: act,
    version: ver,
    locks,
    prev,
    now,
  })
  const errors: BoardFast['errors'] = {}
  if (typeof ds === 'string') errors.db_stats = ds
  if (typeof act === 'string') errors.activity = act
  if (typeof ver === 'string') errors.version = ver
  if (locksErr) errors.locks = locksErr
  const res: BoardFast = {
    tier: 'fast',
    at: new Date(now).toISOString(),
    signals: applyRules(e.signals, rules, { connId, vals: e.vals }),
    kpi: e.kpi,
    sessMix: e.sessMix,
    waitTop: e.waitTop,
    flow: e.flow,
    errors,
  }
  return {
    hit: {
      res,
      ver: typeof ver === 'string' ? null : ver,
      dbSz: typeof ds === 'string' ? null : ds.dbSz,
      statsReset: typeof ds === 'string' ? null : ds.statsReset,
    },
    snap: e.snap,
  }
}

// 분 절삭 upsert(ON CONFLICT DO NOTHING — 같은 분 두 번째 쓰기는 무시). after() 안에서 호출, 실패는 로그만
export async function writeSnap(
  linkId: string,
  connId: string,
  usrId: string,
  v: SnapVals,
  now = Date.now(),
) {
  const who = usrId || 'ADMIN'
  const row: SnapInsert = {
    ...v,
    lnk_id: linkId,
    conn_id: connId,
    bkt_dtm: new Date(Math.floor(now / 60_000) * 60_000).toISOString(),
    regr_id: who,
    modr_id: who,
  }
  const { error } = await db().from('dbm_mon_snap').upsert(row, {
    onConflict: 'lnk_id,conn_id,bkt_dtm',
    ignoreDuplicates: true,
  })
  if (error) console.error('[monitor] snap write', error.code, error.message)
}

// ── 느린 층 — connId 없으면 URL·연계 상태만(접속 없는 분류체계도 보이게) ──
export async function buildSlow(
  linkId: string,
  connId: string | null,
  fast: FastHit | null,
  now = Date.now(),
): Promise<BoardSlow | LinkError> {
  const sumP = linkGet<unknown>(linkId, '/mon/summary?min=60').then(
    (raw) => normalizeSummary(raw, 60),
    (e: unknown) => {
      if (e instanceof LinkError) return e
      throw e
    },
  )
  if (!connId) {
    const sum = await sumP
    if (sum instanceof LinkError && PATH_CODES.has(sum.code)) return sum
    return {
      tier: 'slow',
      at: new Date(now).toISOString(),
      signals: [
        evalUrl(sum instanceof LinkError ? sum.code : sum.url, now).signal,
      ],
      slowTop: [],
      sizeTop: [],
      capacity: { points: [], limitByte: null, perDay: null, daysLeft: null },
      tree: { nodes: [], partial: false },
      app: sum instanceof LinkError ? null : sum.app,
      errors: sum instanceof LinkError ? { summary: sum.code } : {},
    }
  }
  const names: [QueryName, Record<string, unknown>?][] = [
    ['top_sql', { limit: 10 }],
    ['tbl_stats'],
    ['idx_stats'],
    ['sizes'],
    ['archiver'],
    ['replication'],
  ]
  if (!fast?.ver) names.push(['version'])
  // 대상 DB 동시 연결 3개 상한 — 조회 1회마다 새 pg 연결(schema.pi queries.ts)
  // ponytail: 3개씩 직렬 묶음(의도된 순차 await). 연결 풀러가 생기면 한 번에
  const chunks = async () => {
    const out: (QueryResult | LinkError)[] = []
    for (let k = 0; k < names.length; k += 3)
      out.push(
        ...(await Promise.all(
          names.slice(k, k + 3).map(([q, p]) => run(linkId, connId, q, p)),
        )),
      )
    return out
  }
  // R-P1 — 대상 DB 조회 묶음과 앱 DB·schema.pi 요약 읽기는 동시에
  const [qs, sum, rules, points, snap] = await Promise.all([
    chunks(),
    sumP,
    loadRules(linkId),
    sizePoints(linkId, connId),
    fast ? null : lastSnap(linkId, connId),
  ])
  const [topR, tblR, idxR, sizR, arcR, repR, verR] = qs
  if (sum instanceof LinkError && pathFail([...qs, sum])) return sum
  const ver =
    fast?.ver ??
    (verR && !(verR instanceof LinkError) ? parseVersion(verR) : null)
  const limitByte = storageLimit(rules, connId)
  const fc = forecast(points, limitByte ?? 0)
  const capacity: Capacity = {
    points,
    limitByte,
    perDay: fc.perDay,
    daysLeft: limitByte ? fc.daysLeft : null,
  }
  // DB 크기·통계 초기화 = 빠른 층 캐시 → 없으면 최근 스냅샷(추가 대상 DB 호출 없음)
  const dbSz = fast ? fast.dbSz : (snap?.db_sz_byte ?? null)
  const e = evalSlow({
    topSql: val(topR, parseTopSql),
    tbl: val(tblR, parseTbl),
    idx: val(idxR, parseIdx),
    sizes: val(sizR, parseSizes),
    arc: val(arcR, parseArc),
    repl: val(repR, parseRepl),
    version: ver,
    statsReset: fast ? fast.statsReset : (snap?.stat_reset_dtm ?? null),
    dbSzByte: dbSz,
    summaryUrl: sum instanceof LinkError ? sum.code : sum.url,
    capacity,
    now,
  })
  const errors: BoardSlow['errors'] = {}
  const keys = [
    'top_sql',
    'tbl_stats',
    'idx_stats',
    'sizes',
    'archiver',
    'replication',
    'version',
  ] as const
  qs.forEach((r, k) => {
    if (r instanceof LinkError) errors[keys[k]] = r.code
  })
  if (sum instanceof LinkError) errors.summary = sum.code
  return {
    tier: 'slow',
    at: new Date(now).toISOString(),
    signals: applyRules(e.signals, rules, { connId, vals: e.vals }),
    slowTop: e.slowTop,
    sizeTop: e.sizeTop,
    capacity,
    tree: e.tree,
    app: sum instanceof LinkError ? null : sum.app,
    errors,
  }
}
