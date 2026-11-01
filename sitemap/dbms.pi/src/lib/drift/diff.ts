// 모델↔DB 정합 대조(순수 함수) — PRD 12 §5-3 DDL 적용 대조 + §5-4 인덱스 설계 효과. 서버 route 가 schema.pi 모델·DDL 이력·카탈로그를 넣어 부른다.
//  행 데이터 없음(계약 A3) — 이름·타입·통계만 다룬다. 시험 : node --test src/lib/drift/diff.test.mjs

export type ModelCol = { tblId: string; colNm: string; phyTpNm: string | null; dataLen: number | null; nullYn: string | null }
export type ModelIdx = { tblId: string; idxNm: string; unqYn?: string | null; colNms: string[] | string | null }
export type Model = {
  tables: { tblId: string; tblNm: string }[]
  columns: ModelCol[]
  indexes: ModelIdx[]
}
export type DdlReq = { reqId: string; stsCd: string; connId: string | null; reqDtm?: string; stmts: { seq: number; stmtTxt: string; rsltCd?: string | null }[] }
export type QueryResult = { cols: string[]; rows: unknown[][] }

export type DbCol = { tbl: string; col: string; type: string; len: number | null; nullable: boolean }
export type DbIdx = { tbl: string; idx: string; cols: string[]; primary: boolean }
export type IdxStat = { idx: string; scans: number; sizeBytes: number | null }

export type DriftResult = {
  missingTables: string[]
  extraTables: string[]
  colMismatches: { tbl: string; col: string; kind: 'MISSING' | 'EXTRA' | 'TYPE' | 'NULL'; model?: string; db?: string }[]
  missingIndexes: { tbl: string; idx: string }[]
  extraIndexes: { tbl: string; idx: string }[]
  ddlMissing: { reqId: string; kind: 'TABLE' | 'INDEX'; name: string }[]
  idxUsage: { tbl: string; idx: string; dbIdx: string; scans: number | null; sizeBytes: number | null; status: 'UNUSED' | 'USED' | 'NO_STATS' }[]
}

export type DriftSummary = Record<keyof DriftResult, number> & { unusedIndexes: number }

const up = (s: unknown) => String(s ?? '').trim().toUpperCase()

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
const toNum = (v: unknown) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const truthy = (v: unknown) => v === true || ['YES', 'Y', 'TRUE', 'T', '1'].includes(up(v))

const TBL = ['table_name', 'tbl_nm', 'tablename', 'relname', 'tbl']
export function parseTables(r: QueryResult): string[] {
  const t = pick(r.cols, TBL)
  return r.rows.map((row) => up(cell(row, t))).filter(Boolean)
}
export function parseColumns(r: QueryResult): DbCol[] {
  const t = pick(r.cols, TBL)
  const c = pick(r.cols, ['column_name', 'col_nm', 'attname', 'col'])
  const ty = pick(r.cols, ['data_type', 'type', 'udt_name', 'col_type', 'format_type'])
  const ln = pick(r.cols, ['character_maximum_length', 'char_len', 'data_len', 'len', 'numeric_precision'])
  const nl = pick(r.cols, ['is_nullable', 'nullable', 'null_yn'])
  const nn = pick(r.cols, ['not_null', 'attnotnull'])
  return r.rows.map((row) => ({
    tbl: up(cell(row, t)),
    col: up(cell(row, c)),
    type: up(cell(row, ty)),
    len: toNum(cell(row, ln)),
    nullable: nl >= 0 ? truthy(cell(row, nl)) : nn >= 0 ? !truthy(cell(row, nn)) : true,
  }))
}
// 인덱스 칼럼 목록 — 배열·콤마 문자열·indexdef(… USING btree (a, b)) 모두 받는다
function idxCols(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(up)
  const s = String(v ?? '')
  const m = /\(([^()]*)\)\s*$/.exec(s)
  return (m ? m[1] : s).split(',').map((x) => up(x.replace(/"/g, '').split(/\s+/).filter(Boolean)[0])).filter(Boolean)
}
export function parseIndexes(r: QueryResult): DbIdx[] {
  const t = pick(r.cols, TBL)
  const i = pick(r.cols, ['index_name', 'indexname', 'idx_nm', 'indexrelname', 'idx'])
  const c = pick(r.cols, ['columns', 'col_nms', 'cols', 'column_names', 'indexdef'])
  const p = pick(r.cols, ['is_primary', 'indisprimary', 'primary', 'pk_yn'])
  return r.rows.map((row) => {
    const idx = up(cell(row, i))
    return {
      tbl: up(cell(row, t)),
      idx,
      cols: idxCols(cell(row, c)),
      primary: p >= 0 ? truthy(cell(row, p)) : /^PK_|_PKEY$/.test(idx),
    }
  })
}
export function parseIdxStats(r: QueryResult): IdxStat[] {
  const i = pick(r.cols, ['index_name', 'indexrelname', 'indexname', 'idx_nm', 'idx'])
  const s = pick(r.cols, ['idx_scan', 'scans', 'scan_cnt'])
  const z = pick(r.cols, ['size_bytes', 'index_size', 'idx_sz', 'size', 'bytes'])
  return r.rows.map((row) => ({ idx: up(cell(row, i)), scans: toNum(cell(row, s)) ?? 0, sizeBytes: toNum(cell(row, z)) }))
}

// 타입 별칭 → 기준 이름(PostgreSQL information_schema 표기와 모델 물리 타입명을 같은 말로)
const TYPE_ALIAS: Record<string, string> = {
  'CHARACTER VARYING': 'VARCHAR', VARCHAR2: 'VARCHAR', CHARACTER: 'CHAR', BPCHAR: 'CHAR',
  INT: 'INTEGER', INT4: 'INTEGER', INT8: 'BIGINT', INT2: 'SMALLINT', SERIAL: 'INTEGER', BIGSERIAL: 'BIGINT',
  DECIMAL: 'NUMERIC', NUMBER: 'NUMERIC', BOOL: 'BOOLEAN', FLOAT8: 'DOUBLE PRECISION', FLOAT4: 'REAL',
  'TIMESTAMP WITH TIME ZONE': 'TIMESTAMPTZ', 'TIMESTAMP WITHOUT TIME ZONE': 'TIMESTAMP',
  'TIME WITH TIME ZONE': 'TIMETZ', 'TIME WITHOUT TIME ZONE': 'TIME',
}
export function normType(t: string): { base: string; len: number | null } {
  const m = /^([^(]+?)\s*(?:\((\d+)[^)]*\))?\s*$/.exec(up(t))
  const base = (m?.[1] ?? up(t)).trim()
  return { base: TYPE_ALIAS[base] ?? base, len: m?.[2] ? Number(m[2]) : null }
}

// 완료된 DDL 요청의 생성 대상(테이블·인덱스) 이름 — "IF NOT EXISTS"·스키마 접두·따옴표 제거
const NAME = String.raw`(?:IF\s+NOT\s+EXISTS\s+)?((?:"?[\w$]+"?\.)?"?[\w$]+"?)`
const RE_TBL = new RegExp(String.raw`^\s*CREATE\s+(?:UNLOGGED\s+)?TABLE\s+` + NAME, 'i')
const RE_IDX = new RegExp(String.raw`^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?` + NAME, 'i')
const bare = (s: string) => up(s.replace(/"/g, '').split('.').pop())
export function ddlTargets(stmt: string): { kind: 'TABLE' | 'INDEX'; name: string } | null {
  const t = RE_TBL.exec(stmt)
  if (t) return { kind: 'TABLE', name: bare(t[1]) }
  const i = RE_IDX.exec(stmt)
  return i ? { kind: 'INDEX', name: bare(i[1]) } : null
}

const DONE = new Set(['DONE', 'SUCC', 'SUCCESS', 'COMPLETE', 'APPLIED'])

export function diffModel(input: {
  model: Model
  ddl: DdlReq[]
  connId: string
  tables: string[]
  columns: DbCol[]
  indexes: DbIdx[]
  stats: IdxStat[]
}): DriftResult {
  const { model, connId } = input
  const tblNm = new Map(model.tables.map((t) => [t.tblId, up(t.tblNm)]))
  const modelTbls = new Set(tblNm.values())
  const dbTbls = new Set(input.tables)
  for (const c of input.columns) dbTbls.add(c.tbl) // catalog_tables 가 비어도 칼럼에서 보충

  const missingTables = [...modelTbls].filter((t) => !dbTbls.has(t)).sort()
  const extraTables = [...dbTbls].filter((t) => !modelTbls.has(t)).sort()

  // 칼럼 — DB 에 있는 모델 테이블만 비교(없는 테이블은 missingTables 로 이미 보고)
  const dbCols = new Map(input.columns.map((c) => [`${c.tbl}.${c.col}`, c]))
  const colMismatches: DriftResult['colMismatches'] = []
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
    if (mt.base && dt.base && (mt.base !== dt.base || (lenSensitive && mLen != null && dLen != null && mLen !== dLen)))
      colMismatches.push({ tbl, col, kind: 'TYPE', model: mLen != null && lenSensitive ? `${mt.base}(${mLen})` : mt.base, db: dLen != null && lenSensitive ? `${dt.base}(${dLen})` : dt.base })
    const mNull = up(mc.nullYn) !== 'N'
    if (mNull !== dc.nullable) colMismatches.push({ tbl, col, kind: 'NULL', model: mNull ? 'NULL' : 'NOT NULL', db: dc.nullable ? 'NULL' : 'NOT NULL' })
  }
  for (const dc of input.columns)
    if (modelTbls.has(dc.tbl) && !seen.has(`${dc.tbl}.${dc.col}`)) colMismatches.push({ tbl: dc.tbl, col: dc.col, kind: 'EXTRA' })

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
    const db = dbIdxByName.get(idx) ?? input.indexes.find((d) => d.tbl === tbl && !matched.has(d.idx) && cols && d.cols.join(',') === cols)
    if (db) {
      matched.add(db.idx)
      pairs.push({ tbl, idx, db })
    } else if (dbTbls.has(tbl)) missingIndexes.push({ tbl, idx })
  }
  const extraIndexes = input.indexes
    .filter((d) => modelTbls.has(d.tbl) && !d.primary && !matched.has(d.idx))
    .map((d) => ({ tbl: d.tbl, idx: d.idx }))

  // DDL 완료인데 DB 에 없음 = 수동 삭제·롤백 의심(선택한 접속에 적용된 요청만)
  const dbIdxNames = new Set(input.indexes.map((i) => i.idx))
  const ddlMissing: DriftResult['ddlMissing'] = []
  for (const r of input.ddl) {
    if (!DONE.has(up(r.stsCd)) || (r.connId && r.connId !== connId)) continue
    for (const s of r.stmts) {
      if (s.rsltCd && !DONE.has(up(s.rsltCd)) && up(s.rsltCd) !== 'OK') continue
      const t = ddlTargets(s.stmtTxt)
      if (t && !(t.kind === 'TABLE' ? dbTbls : dbIdxNames).has(t.name)) ddlMissing.push({ reqId: r.reqId, ...t })
    }
  }

  // 5-4 설계 인덱스 사용 효과 — idx_stats 의 스캔 수 0 = 미사용
  const stat = new Map(input.stats.map((s) => [s.idx, s]))
  const idxUsage: DriftResult['idxUsage'] = pairs.map(({ tbl, idx, db }) => {
    const s = stat.get(db.idx)
    return { tbl, idx, dbIdx: db.idx, scans: s?.scans ?? null, sizeBytes: s?.sizeBytes ?? null, status: !s ? 'NO_STATS' : s.scans > 0 ? 'USED' : 'UNUSED' }
  })

  return { missingTables, extraTables, colMismatches, missingIndexes, extraIndexes, ddlMissing, idxUsage }
}

export function summarize(r: DriftResult): DriftSummary {
  return {
    missingTables: r.missingTables.length,
    extraTables: r.extraTables.length,
    colMismatches: r.colMismatches.length,
    missingIndexes: r.missingIndexes.length,
    extraIndexes: r.extraIndexes.length,
    ddlMissing: r.ddlMissing.length,
    idxUsage: r.idxUsage.length,
    unusedIndexes: r.idxUsage.filter((u) => u.status === 'UNUSED').length,
  }
}
