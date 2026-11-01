// 모델↔DB GAP분석 대조(순수 함수) — PRD 12 §5-3 DDL 적용 대조 + §5-4 인덱스 설계 효과. 서버 route 가 schema.pi 모델·DDL 이력·카탈로그를 넣어 부른다.
//  행 데이터 없음(계약 A3) — 이름·타입·통계만 다룬다. 시험 : node --test src/lib/drift/diff.test.mjs

export type ModelCol = {
  tblId: string
  colNm: string
  phyTpNm: string | null
  dataLen: number | null
  nullYn: string | null
}
export type ModelIdx = {
  tblId: string
  idxNm: string
  unqYn?: string | null
  colNms: string[] | string | null
}
export type Model = {
  tables: { tblId: string; tblNm: string }[]
  columns: ModelCol[]
  indexes: ModelIdx[]
}
export type DdlReq = {
  reqId: string
  stsCd: string
  connId: string | null
  reqDtm?: string
  stmts: {
    seq: number
    stmtTxt: string
    rsltCd?: string | null
    endDtm?: string | null
  }[]
}
export type QueryResult = { cols: string[]; rows: unknown[][] }

export type DbTbl = {
  name: string
  kind: string | null
  estRows: number | null
}
export type DbCol = {
  tbl: string
  col: string
  type: string
  len: number | null
  nullable: boolean
}
export type DbIdx = {
  tbl: string
  idx: string
  cols: string[]
  primary: boolean
  unique: boolean
}
export type IdxStat = { idx: string; scans: number; sizeBytes: number | null }

// 사용 효과 판정 — 스캔 0 을 바로 '미사용'으로 단정하지 않는다(빈 테이블·막 만든 인덱스·유일성 보장용은 삭제 대상 아님)
export type IdxUsageSts =
  | 'NO_STATS'
  | 'USED'
  | 'CONSTRAINT'
  | 'NO_DATA'
  | 'OBSERVING'
  | 'UNUSED_CAND'
export type DriftResult = {
  missingTables: string[]
  extraTables: string[]
  colMismatches: {
    tbl: string
    col: string
    kind: 'MISSING' | 'EXTRA' | 'TYPE' | 'NULL'
    model?: string
    db?: string
  }[]
  sysCols: { tbl: string; col: string }[] // DDL 생성 때만 붙는 시스템 칼럼 — 모델에 없는 것이 정상
  missingIndexes: { tbl: string; idx: string }[]
  extraIndexes: { tbl: string; idx: string }[]
  ddlMissing: { reqId: string; kind: 'TABLE' | 'INDEX'; name: string }[]
  superseded: { reqId: string; by: string; names: string[] }[] // 같은 테이블을 나중 요청이 다시 만들어(DROP … CASCADE) 대조에서 뺀 이전 요청
  renamed: { reqId: string; name: string; dbName: string }[] // 구 이름 규칙 <T>_PKEY ↔ 신 PK_<T>
  idxUsage: {
    tbl: string
    idx: string
    dbIdx: string
    scans: number | null
    sizeBytes: number | null
    estRows: number | null
    since: string | null // 판정 기준 시각 = 통계 초기화·인덱스 생성 중 늦은 쪽
    status: IdxUsageSts
  }[]
}

export type DriftSummary = Record<keyof DriftResult, number> & {
  unusedIndexes: number
}

// 판정 임계값 — 빈 인덱스 1페이지(8 KB), 생성·통계 초기화 뒤 관찰 기간 7일
const EMPTY_IDX_BYTES = 8192
const OBS_DAYS = 7
// schema.pi 이름 붙인 조회 행 상한(schema.pi src/lib/link/queries.ts MAX_ROWS) — 닿으면 결과가 잘렸을 수 있다
export const LINK_MAX_ROWS = 500
// 시스템 칼럼 4개 — 정본 schema.pi src/lib/modelpi/phy.ts SYS_COL_NMS(앱이 달라 import 불가, 이름이 바뀌면 함께 고칠 것)
export const SYS_COL_NMS = new Set([
  'LST_MDDTM',
  'LST_MDFR_ID',
  'LST_RGDTM',
  'LST_RGTR_ID',
])
// 비교 대상 테이블 종류 — 일반(r)·파티션(p)만(뷰·구체화 뷰·외부 테이블 제외)
const TBL_KINDS = new Set(['R', 'P'])

const up = (s: unknown) =>
  String(s ?? '')
    .trim()
    .toUpperCase()

// 결과 칼럼 이름 후보 중 처음 맞는 위치 — schema.pi 이름 붙인 조회의 별칭이 확정 전이라 흔한 별칭을 모두 받는다
function pick(cols: string[], names: string[]): number {
  const lc = cols.map((c) => c.toLowerCase())
  for (const n of names) {
    const i = lc.indexOf(n)
    if (i >= 0) return i
  }
  return -1
}
const cell = (row: unknown[], i: number) => (i >= 0 ? row[i] : undefined)
const toNum = (v: unknown) =>
  v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v)
const truthy = (v: unknown) =>
  v === true || ['YES', 'Y', 'TRUE', 'T', '1'].includes(up(v))

const TBL = ['table_name', 'tbl_nm', 'tablename', 'relname', 'tbl']
export function parseTables(r: QueryResult): DbTbl[] {
  const t = pick(r.cols, TBL)
  const k = pick(r.cols, ['relkind', 'table_type', 'kind'])
  const e = pick(r.cols, ['est_rows', 'reltuples', 'n_live_tup'])
  return r.rows
    .map((row) => ({
      name: up(cell(row, t)),
      kind: k >= 0 ? up(cell(row, k)) : null,
      estRows: toNum(cell(row, e)),
    }))
    .filter((x) => x.name && (x.kind == null || TBL_KINDS.has(x.kind)))
}
export function parseColumns(r: QueryResult): DbCol[] {
  const t = pick(r.cols, TBL)
  const c = pick(r.cols, ['column_name', 'col_nm', 'attname', 'col'])
  // data_tp = schema.pi catalog_columns 의 format_type 별칭(빠지면 타입 비교가 통째로 안 됨)
  const ty = pick(r.cols, [
    'data_type',
    'data_tp',
    'type',
    'udt_name',
    'col_type',
    'format_type',
  ])
  const ln = pick(r.cols, [
    'character_maximum_length',
    'char_len',
    'data_len',
    'len',
    'numeric_precision',
  ])
  const nl = pick(r.cols, ['is_nullable', 'nullable', 'null_yn'])
  const nn = pick(r.cols, ['not_null', 'attnotnull'])
  return r.rows.map((row) => ({
    tbl: up(cell(row, t)),
    col: up(cell(row, c)),
    type: up(cell(row, ty)),
    len: toNum(cell(row, ln)),
    nullable:
      nl >= 0 ? truthy(cell(row, nl)) : nn >= 0 ? !truthy(cell(row, nn)) : true,
  }))
}
// 인덱스 칼럼 목록 — 배열·콤마 문자열·indexdef(… USING btree (a, b)) 모두 받는다
function idxCols(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(up)
  const s = String(v ?? '')
  const m = /\(([^()]*)\)\s*$/.exec(s)
  return (m ? m[1] : s)
    .split(',')
    .map((x) => up(x.replace(/"/g, '').split(/\s+/).filter(Boolean)[0]))
    .filter(Boolean)
}
export function parseIndexes(r: QueryResult): DbIdx[] {
  const t = pick(r.cols, TBL)
  const i = pick(r.cols, [
    'index_name',
    'indexname',
    'idx_nm',
    'indexrelname',
    'idx',
  ])
  // idx_def = schema.pi catalog_indexes 의 pg_get_indexdef 별칭
  const c = pick(r.cols, [
    'columns',
    'col_nms',
    'cols',
    'column_names',
    'indexdef',
    'idx_def',
  ])
  const p = pick(r.cols, ['is_primary', 'indisprimary', 'primary', 'pk_yn'])
  const u = pick(r.cols, ['is_unique', 'indisunique', 'unique', 'unq_yn'])
  return r.rows.map((row) => {
    const idx = up(cell(row, i))
    return {
      tbl: up(cell(row, t)),
      idx,
      cols: idxCols(cell(row, c)),
      primary: p >= 0 ? truthy(cell(row, p)) : /^PK_|_PKEY$/.test(idx),
      unique: u >= 0 ? truthy(cell(row, u)) : false,
    }
  })
}
export function parseIdxStats(r: QueryResult): IdxStat[] {
  const i = pick(r.cols, [
    'index_name',
    'indexrelname',
    'indexname',
    'idx_nm',
    'idx',
  ])
  const s = pick(r.cols, ['idx_scan', 'scans', 'scan_cnt'])
  const z = pick(r.cols, [
    'size_bytes',
    'index_size',
    'idx_sz',
    'size',
    'bytes',
  ])
  return r.rows.map((row) => ({
    idx: up(cell(row, i)),
    scans: toNum(cell(row, s)) ?? 0,
    sizeBytes: toNum(cell(row, z)),
  }))
}
// db_stats 의 통계 초기화 시각(없으면 null — 한 번도 초기화 안 됨)
export function parseStatsReset(r: QueryResult | null): string | null {
  if (!r?.rows.length) return null
  const v = cell(r.rows[0], pick(r.cols, ['stats_reset']))
  return v ? String(v) : null
}
// offset 순회 — 페이지가 상한(500행)만큼 꽉 차면 다음 페이지를 받는다(앞 결과에 종속된 순차 호출, R-P1 허용)
//  ponytail: 최대 PAGE_MAX 페이지(5,000행) — 넘으면 cut = true(화면 절단 경고 + 칼럼 누락·추가 확인 불가 처리)
export const PAGE_MAX = 10
export async function pageAll(
  fetchPage: (offset: number) => Promise<QueryResult>,
  max = LINK_MAX_ROWS,
  pages = PAGE_MAX,
): Promise<{ r: QueryResult; cut: boolean }> {
  let last = await fetchPage(0)
  const rows = [...last.rows]
  for (let n = 1; n < pages && last.rows.length >= max; n++) {
    last = await fetchPage(n * max)
    rows.push(...last.rows)
  }
  return { r: { cols: last.cols, rows }, cut: last.rows.length >= max }
}
// 칼럼 조회가 잘렸을 때 — 칼럼 누락(MISSING)·추가(EXTRA)는 잘린 뒤쪽 테이블에서 오탐이므로 결과·요약에서 빼고 건수만 돌려준다(유형·NULL 불일치는 받은 칼럼끼리 비교라 유지)
export function dropUncheckedCols(r: DriftResult): number {
  const keep = r.colMismatches.filter(
    (m) => m.kind !== 'MISSING' && m.kind !== 'EXTRA',
  )
  const n = r.colMismatches.length - keep.length
  r.colMismatches = keep
  return n
}
// 행 상한에 닿은 조회 이름 — 잘렸으면 'DB 에 없음'·'모델에 없음' 판정이 오탐일 수 있어 화면에 경고
export function truncatedOf(
  rs: Record<string, QueryResult | null>,
  max = LINK_MAX_ROWS,
): string[] {
  return Object.entries(rs)
    .filter(([, r]) => r != null && r.rows.length >= max)
    .map(([k]) => k)
}
// 프로젝트 테이블 접두사 추정 — 모델 테이블명 첫 '_' 앞 토큰 중 가장 많은 것(ECM_CST_CUST → ECM)
const pfxOf = (t: string) => (t.includes('_') ? t.slice(0, t.indexOf('_')) : t)
export function projectPrefix(model: Pick<Model, 'tables'>): string | null {
  const n = new Map<string, number>()
  for (const t of model.tables) {
    const p = pfxOf(up(t.tblNm))
    n.set(p, (n.get(p) ?? 0) + 1)
  }
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}
// 모델에 없는 테이블을 접두사로 묶음 — 프로젝트 접두사 묶음(모델 누락 후보) 먼저, 나머지는 많은 순
export function groupByPrefix(
  tables: string[],
  own: string | null,
): { pfx: string; own: boolean; tables: string[] }[] {
  const g = new Map<string, string[]>()
  for (const t of tables) g.set(pfxOf(t), [...(g.get(pfxOf(t)) ?? []), t])
  return [...g]
    .map(([pfx, ts]) => ({ pfx, own: pfx === own, tables: ts }))
    .sort(
      (a, b) =>
        Number(b.own) - Number(a.own) ||
        b.tables.length - a.tables.length ||
        a.pfx.localeCompare(b.pfx),
    )
}

// 타입 별칭 → 기준 이름(PostgreSQL information_schema 표기와 모델 물리 타입명을 같은 말로)
const TYPE_ALIAS: Record<string, string> = {
  'CHARACTER VARYING': 'VARCHAR',
  VARCHAR2: 'VARCHAR',
  CHARACTER: 'CHAR',
  BPCHAR: 'CHAR',
  INT: 'INTEGER',
  INT4: 'INTEGER',
  INT8: 'BIGINT',
  INT2: 'SMALLINT',
  SERIAL: 'INTEGER',
  BIGSERIAL: 'BIGINT',
  DECIMAL: 'NUMERIC',
  NUMBER: 'NUMERIC',
  BOOL: 'BOOLEAN',
  FLOAT8: 'DOUBLE PRECISION',
  FLOAT4: 'REAL',
  'TIMESTAMP WITH TIME ZONE': 'TIMESTAMPTZ',
  'TIMESTAMP WITHOUT TIME ZONE': 'TIMESTAMP',
  'TIME WITH TIME ZONE': 'TIMETZ',
  'TIME WITHOUT TIME ZONE': 'TIME',
}
export function normType(t: string): { base: string; len: number | null } {
  const m = /^([^(]+?)\s*(?:\((\d+)[^)]*\))?\s*$/.exec(up(t))
  const base = (m?.[1] ?? up(t)).trim()
  return { base: TYPE_ALIAS[base] ?? base, len: m?.[2] ? Number(m[2]) : null }
}

// 완료된 DDL 요청의 생성 대상(테이블·인덱스) 이름 — "IF NOT EXISTS"·스키마 접두·따옴표 제거
const NAME = String.raw`(?:IF\s+NOT\s+EXISTS\s+)?((?:"?[\w$]+"?\.)?"?[\w$]+"?)`
const RE_TBL = new RegExp(
  String.raw`^\s*CREATE\s+(?:UNLOGGED\s+)?TABLE\s+` + NAME,
  'i',
)
// 인덱스는 ON <테이블> 도 잡아 소속 테이블을 안다(그 테이블이 나중에 재생성됐는지 판단)
const RE_IDX = new RegExp(
  String.raw`^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?` +
    NAME +
    String.raw`(?:\s+ON\s+(?:ONLY\s+)?((?:"?[\w$]+"?\.)?"?[\w$]+"?))?`,
  'i',
)
const bare = (s: string) => up(s.replace(/"/g, '').split('.').pop())
export function ddlTargets(
  stmt: string,
): { kind: 'TABLE' | 'INDEX'; name: string; tbl?: string } | null {
  const t = RE_TBL.exec(stmt)
  if (t) return { kind: 'TABLE', name: bare(t[1]) }
  const i = RE_IDX.exec(stmt)
  return i
    ? { kind: 'INDEX', name: bare(i[1]), ...(i[2] ? { tbl: bare(i[2]) } : {}) }
    : null
}
// PK 인덱스 이름 짝 — 구 PostgreSQL <T>_PKEY ↔ 신 PK_<T>(schema.pi 2026-10-20 재정의)
const pkAlias = (n: string) =>
  n.endsWith('_PKEY')
    ? `PK_${n.slice(0, -5)}`
    : n.startsWith('PK_')
      ? `${n.slice(3)}_PKEY`
      : null

const DONE = new Set(['DONE', 'SUCC', 'SUCCESS', 'COMPLETE', 'APPLIED'])

export function diffModel(input: {
  model: Model
  ddl: DdlReq[]
  connId: string
  tables: DbTbl[]
  columns: DbCol[]
  indexes: DbIdx[]
  stats: IdxStat[]
  statsReset?: string | null
  now?: number
}): DriftResult {
  const { model, connId } = input
  const now = input.now ?? Date.now()
  const tblNm = new Map(model.tables.map((t) => [t.tblId, up(t.tblNm)]))
  const modelTbls = new Set(tblNm.values())
  const dbTbls = new Set(input.tables.map((t) => t.name))
  // catalog_tables 가 비었을 때만 칼럼에서 보충 — 칼럼 조회엔 relkind 가 없어 늘 보충하면 뷰가 다시 섞인다
  if (!input.tables.length) for (const c of input.columns) dbTbls.add(c.tbl)
  const estRows = new Map(input.tables.map((t) => [t.name, t.estRows]))

  const missingTables = [...modelTbls].filter((t) => !dbTbls.has(t)).sort()
  const extraTables = [...dbTbls].filter((t) => !modelTbls.has(t)).sort()

  // 칼럼 — DB 에 있는 모델 테이블만 비교(없는 테이블은 missingTables 로 이미 보고)
  const dbCols = new Map(input.columns.map((c) => [`${c.tbl}.${c.col}`, c]))
  const colMismatches: DriftResult['colMismatches'] = []
  const sysCols: DriftResult['sysCols'] = []
  const seen = new Set<string>()
  for (const mc of model.columns) {
    const tbl = tblNm.get(mc.tblId)
    if (!tbl || !dbTbls.has(tbl)) continue
    const col = up(mc.colNm)
    const key = `${tbl}.${col}`
    seen.add(key)
    const dc = dbCols.get(key)
    if (!dc) {
      colMismatches.push({ tbl, col, kind: 'MISSING' })
      continue
    }
    const mt = normType(mc.phyTpNm ?? '')
    const dt = normType(dc.type)
    const mLen = mt.len ?? mc.dataLen ?? null
    const dLen = dt.len ?? dc.len
    const lenSensitive = ['VARCHAR', 'CHAR'].includes(mt.base)
    if (
      mt.base &&
      dt.base &&
      (mt.base !== dt.base ||
        (lenSensitive && mLen != null && dLen != null && mLen !== dLen))
    )
      colMismatches.push({
        tbl,
        col,
        kind: 'TYPE',
        model: mLen != null && lenSensitive ? `${mt.base}(${mLen})` : mt.base,
        db: dLen != null && lenSensitive ? `${dt.base}(${dLen})` : dt.base,
      })
    const mNull = up(mc.nullYn) !== 'N'
    if (mNull !== dc.nullable)
      colMismatches.push({
        tbl,
        col,
        kind: 'NULL',
        model: mNull ? 'NULL' : 'NOT NULL',
        db: dc.nullable ? 'NULL' : 'NOT NULL',
      })
  }
  for (const dc of input.columns) {
    if (!modelTbls.has(dc.tbl) || seen.has(`${dc.tbl}.${dc.col}`)) continue
    if (SYS_COL_NMS.has(dc.col)) sysCols.push({ tbl: dc.tbl, col: dc.col })
    else colMismatches.push({ tbl: dc.tbl, col: dc.col, kind: 'EXTRA' })
  }

  // 인덱스 — 이름이 같거나, 이름이 달라도 같은 테이블·같은 칼럼 순서면 같은 인덱스로 본다
  const dbIdxByName = new Map(input.indexes.map((i) => [i.idx, i]))
  const matched = new Set<string>()
  const missingIndexes: DriftResult['missingIndexes'] = []
  const pairs: { tbl: string; idx: string; db: DbIdx }[] = []
  for (const mi of model.indexes) {
    const tbl = tblNm.get(mi.tblId)
    if (!tbl) continue
    const idx = up(mi.idxNm)
    const cols = idxCols(mi.colNms).join(',')
    const db =
      dbIdxByName.get(idx) ??
      input.indexes.find(
        (d) =>
          d.tbl === tbl &&
          !matched.has(d.idx) &&
          cols &&
          d.cols.join(',') === cols,
      )
    if (db) {
      matched.add(db.idx)
      pairs.push({ tbl, idx, db })
    } else if (dbTbls.has(tbl)) missingIndexes.push({ tbl, idx })
  }
  const extraIndexes = input.indexes
    .filter((d) => modelTbls.has(d.tbl) && !d.primary && !matched.has(d.idx))
    .map((d) => ({ tbl: d.tbl, idx: d.idx }))

  // DDL 완료인데 DB 에 없음(선택한 접속에 적용된 요청만) — 최신 요청부터 보며
  //  (a) 같은 객체는 가장 최신 적용 1회만 (b) 나중 요청이 다시 만든 테이블의 이전 요청 객체는 '대체됨'(DROP … CASCADE 로 사라지는 게 정상)
  //  (c) 구 이름 <T>_PKEY ↔ 신 PK_<T> 는 짝이 DB 에 있으면 '이름 규칙 변경'(정상)
  const dbIdxNames = new Set(input.indexes.map((i) => i.idx))
  const ddlMissing: DriftResult['ddlMissing'] = []
  const superseded: DriftResult['superseded'] = []
  const renamed: DriftResult['renamed'] = []
  const idxCreated = new Map<string, string>() // 인덱스 → 가장 최신 생성 시각
  const recreatedBy = new Map<string, string>() // 테이블 → 그 테이블을 다시 만든 더 최신 요청
  const seenObj = new Set<string>()
  const reqs = input.ddl
    .filter((r) => DONE.has(up(r.stsCd)) && (!r.connId || r.connId === connId))
    .sort((a, b) =>
      String(b.reqDtm ?? '').localeCompare(String(a.reqDtm ?? '')),
    ) // 최신순(시각 없으면 응답 순서 = 최신순 유지)
  for (const r of reqs) {
    const created: string[] = []
    const old = new Map<string, string[]>() // 대체한 요청 → 이 요청에서 빠진 객체
    for (const s of r.stmts) {
      if (s.rsltCd && !DONE.has(up(s.rsltCd)) && up(s.rsltCd) !== 'OK') continue
      const t = ddlTargets(s.stmtTxt)
      if (!t) continue
      const tbl = t.kind === 'TABLE' ? t.name : t.tbl
      const by = tbl ? recreatedBy.get(tbl) : undefined
      if (by) {
        old.set(by, [...(old.get(by) ?? []), t.name])
        continue
      }
      if (t.kind === 'TABLE') created.push(t.name)
      const key = `${t.kind}:${t.name}`
      if (seenObj.has(key)) continue
      seenObj.add(key)
      if (t.kind === 'INDEX') idxCreated.set(t.name, s.endDtm ?? r.reqDtm ?? '')
      if ((t.kind === 'TABLE' ? dbTbls : dbIdxNames).has(t.name)) continue
      const alias = t.kind === 'INDEX' ? pkAlias(t.name) : null
      if (alias && dbIdxNames.has(alias))
        renamed.push({ reqId: r.reqId, name: t.name, dbName: alias })
      else ddlMissing.push({ reqId: r.reqId, kind: t.kind, name: t.name })
    }
    for (const [by, names] of old)
      superseded.push({ reqId: r.reqId, by, names })
    // 이 요청이 만든 테이블은 '더 오래된' 요청부터 대체 판정(같은 요청 안 인덱스는 대상 아님)
    for (const t of created)
      if (!recreatedBy.has(t)) recreatedBy.set(t, r.reqId)
  }

  // 5-4 설계 인덱스 사용 효과 — 스캔 0 이어도 빈 테이블·관찰 기간 미달·유일성 보장용은 '미사용 후보'가 아니다
  const stat = new Map(input.stats.map((s) => [s.idx, s]))
  const resetMs = input.statsReset ? Date.parse(input.statsReset) : NaN
  const idxUsage: DriftResult['idxUsage'] = pairs.map(({ tbl, idx, db }) => {
    const s = stat.get(db.idx)
    const rows = estRows.get(db.tbl) ?? null
    const sizeBytes = s?.sizeBytes ?? null
    const createdMs = Date.parse(
      idxCreated.get(db.idx) ?? idxCreated.get(idx) ?? '',
    )
    const sinceMs = Math.max(
      Number.isNaN(resetMs) ? -Infinity : resetMs,
      Number.isNaN(createdMs) ? -Infinity : createdMs,
    )
    const since = Number.isFinite(sinceMs)
      ? new Date(sinceMs).toISOString()
      : null
    // reltuples 는 ANALYZE 전 -1·0 이라 '행 없음'은 크기와 OR 로 느슨히 — 화면 문구도 "데이터 없음 또는 통계 미수집"
    const status: IdxUsageSts = !s
      ? 'NO_STATS'
      : s.scans > 0
        ? 'USED'
        : db.primary || db.unique
          ? 'CONSTRAINT'
          : (rows != null && rows <= 0) ||
              (sizeBytes != null && sizeBytes <= EMPTY_IDX_BYTES)
            ? 'NO_DATA'
            : Number.isFinite(sinceMs) && now - sinceMs < OBS_DAYS * 86_400_000
              ? 'OBSERVING'
              : 'UNUSED_CAND'
    return {
      tbl,
      idx,
      dbIdx: db.idx,
      scans: s?.scans ?? null,
      sizeBytes,
      estRows: rows,
      since,
      status,
    }
  })

  return {
    missingTables,
    extraTables,
    colMismatches,
    sysCols,
    missingIndexes,
    extraIndexes,
    ddlMissing,
    superseded,
    renamed,
    idxUsage,
  }
}

export function summarize(r: DriftResult): DriftSummary {
  return {
    missingTables: r.missingTables.length,
    extraTables: r.extraTables.length,
    colMismatches: r.colMismatches.length, // 시스템 칼럼 제외
    sysCols: r.sysCols.length,
    missingIndexes: r.missingIndexes.length,
    extraIndexes: r.extraIndexes.length,
    ddlMissing: r.ddlMissing.length,
    superseded: r.superseded.length,
    renamed: r.renamed.length,
    idxUsage: r.idxUsage.length,
    unusedIndexes: r.idxUsage.filter((u) => u.status === 'UNUSED_CAND').length, // 미사용 후보만
  }
}
