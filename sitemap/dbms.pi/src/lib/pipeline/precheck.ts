// PiCDC 원천 사전 점검(순수 함수) — PRD 12 §7-1(CDC-R00). route 가 카탈로그·설정·복제 조회 결과를 넣어 부른다.
//  테이블마다 변경시각 칼럼·논리삭제 칼럼·PK 유무 → 권장 어댑터(LOGICAL / POLL / KEY_DIFF / NONE) + 근거 코드. 행 데이터 없음(A3)
//  시험 : node --test src/lib/pipeline/precheck.test.mjs (sitemap/dbms.pi 에서)

export type QueryResult = { cols: string[]; rows: unknown[][] }
export type Adapter = 'LOGICAL' | 'POLL' | 'KEY_DIFF' | 'NONE'
export const ADAPTERS = ['POLL', 'LOGICAL', 'KEY_DIFF'] as const

export type Readiness = {
  walLevel: string | null
  maxSlots: number | null
  maxSenders: number | null
  senders: number | null // pg_stat_replication 행 수(조회 실패 = null)
  inRecovery: boolean
  logicalReady: boolean
  reasons: string[]
}

export type TablePrecheck = {
  schema: string
  table: string
  estRows: number | null
  chgCol: string | null
  delCol: string | null
  pkYn: boolean
  adapter: Adapter
  alts: Adapter[]
  reasons: string[]
}

// 변경시각 칼럼 이름 후보(소문자) — DA 표준(mod_dtm·lst_mddtm) + 흔한 영문 관례
const CHG_NAMES = new Set([
  'mod_dtm', 'lst_mddtm', 'lst_mod_dtm', 'upd_dtm', 'chg_dtm', 'mod_dt', 'upd_dt',
  'updated_at', 'update_at', 'updated_on', 'updated_dt', 'updated_date', 'update_date', 'update_time', 'updated_time',
  'modified_at', 'modified_on', 'modified_date', 'last_modified', 'last_modified_at', 'last_updated', 'last_updated_at',
  'updatedat', 'modifiedat', 'lastmodified', 'moddate', 'updatedate',
])
// 논리삭제 칼럼 후보 — 여부(yn/flag/bool) 또는 삭제일시
const DEL_NAMES = new Set([
  'del_yn', 'delete_yn', 'deleted_yn', 'is_deleted', 'deleted', 'del_flag', 'delete_flag', 'deleted_flag',
  'del_dtm', 'deleted_at', 'deleted_on', 'deleted_date', 'isdeleted', 'deletedat',
])
const TIME_TYPE = /timestamp|date|time/i

const lc = (v: unknown) => String(v ?? '').trim().toLowerCase()
const toNum = (v: unknown) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const truthy = (v: unknown) => v === true || ['t', 'true', 'y', 'yes', '1', 'on'].includes(lc(v))
const col = (r: QueryResult, name: string) => r.cols.findIndex((c) => c.toLowerCase() === name)
const key = (s: unknown, t: unknown) => `${lc(s)}.${lc(t)}`

// pg_settings 행(name, setting) + pg_stat_replication 행 → 논리 복제 준비 상태
export function readiness(settings: QueryResult | null, repl: QueryResult | null): Readiness {
  const map = new Map<string, unknown>()
  if (settings) {
    const n = col(settings, 'name')
    const s = col(settings, 'setting')
    for (const row of settings.rows) map.set(lc(row[n]), row[s])
  }
  const walLevel = map.has('wal_level') ? lc(map.get('wal_level')) : null
  const maxSlots = toNum(map.get('max_replication_slots'))
  const maxSenders = toNum(map.get('max_wal_senders'))
  const rc = repl ? col(repl, 'in_recovery') : -1
  // pg_stat_replication 이 비어도 in_recovery 는 알 수 없음 → settings 의 in_hot_standby(PG14+) 로 보완
  const inRecovery = (repl && rc >= 0 && repl.rows.some((r) => truthy(r[rc]))) || truthy(map.get('in_hot_standby'))
  const reasons: string[] = []
  if (!settings) reasons.push('SETTINGS_UNKNOWN')
  else if (walLevel !== 'logical') reasons.push('WAL_NOT_LOGICAL')
  else reasons.push('WAL_LOGICAL')
  if (settings && !(maxSlots && maxSlots > 0)) reasons.push('NO_SLOTS')
  if (settings && !(maxSenders && maxSenders > 0)) reasons.push('NO_SENDERS')
  if (inRecovery) reasons.push('IS_STANDBY')
  const logicalReady = walLevel === 'logical' && !!maxSlots && maxSlots > 0 && !!maxSenders && maxSenders > 0 && !inRecovery
  return { walLevel, maxSlots, maxSenders, senders: repl ? repl.rows.length : null, inRecovery, logicalReady, reasons }
}

// 카탈로그(테이블·칼럼·인덱스) → 테이블별 판정. 뷰·외부테이블 제외(relkind r·p 만)
export function classify(
  tables: QueryResult,
  columns: QueryResult,
  indexes: QueryResult,
  ready: Pick<Readiness, 'logicalReady'>,
): TablePrecheck[] {
  const cs = col(columns, 'schemaname')
  const ct = col(columns, 'relname')
  const cn = col(columns, 'attname')
  const cy = col(columns, 'data_tp')
  const chg = new Map<string, string>()
  const del = new Map<string, string>()
  for (const r of columns.rows) {
    const k = key(r[cs], r[ct])
    const name = lc(r[cn])
    if (!chg.has(k) && CHG_NAMES.has(name) && TIME_TYPE.test(String(r[cy] ?? ''))) chg.set(k, name)
    if (!del.has(k) && DEL_NAMES.has(name)) del.set(k, name)
  }
  const is = col(indexes, 'schemaname')
  const it = col(indexes, 'relname')
  const ip = col(indexes, 'indisprimary')
  const pk = new Set(indexes.rows.filter((r) => truthy(r[ip])).map((r) => key(r[is], r[it])))

  const ts = col(tables, 'schemaname')
  const tt = col(tables, 'relname')
  const tk = col(tables, 'relkind')
  const te = col(tables, 'est_rows')
  return tables.rows
    .filter((r) => ['r', 'p'].includes(lc(r[tk])))
    .map((r) => {
      const k = key(r[ts], r[tt])
      const chgCol = chg.get(k) ?? null
      const delCol = del.get(k) ?? null
      const pkYn = pk.has(k)
      const est = toNum(r[te])
      return { schema: String(r[ts]), table: String(r[tt]), estRows: est != null && est < 0 ? null : est, chgCol, delCol, pkYn, ...recommend(chgCol, delCol, pkYn, ready.logicalReady) }
    })
}

// 우선순위 : LOGICAL(WAL 준비 + PK, 삭제까지 포착) > POLL(변경시각) > KEY_DIFF(PK 스냅샷 비교) > NONE(전체 재적재만)
export function recommend(chgCol: string | null, delCol: string | null, pkYn: boolean, logicalReady: boolean) {
  const reasons = [chgCol ? 'HAS_CHG_COL' : 'NO_CHG_COL', delCol ? 'HAS_SOFT_DEL' : 'NO_SOFT_DEL', pkYn ? 'HAS_PK' : 'NO_PK']
  const alts: Adapter[] = []
  if (logicalReady && pkYn) alts.push('LOGICAL')
  if (chgCol) alts.push('POLL')
  if (pkYn) alts.push('KEY_DIFF')
  const adapter: Adapter = alts[0] ?? 'NONE'
  // 폴링은 물리 DELETE 를 보지 못한다 — 논리삭제 칼럼이 없으면 경고
  if (adapter === 'POLL' && !delCol) reasons.push('DELETE_UNSEEN')
  if (!logicalReady && pkYn) reasons.push('LOGICAL_NOT_READY')
  if (adapter === 'NONE') reasons.push('FULL_RELOAD_ONLY')
  return { adapter, alts, reasons }
}

export function summarize(items: TablePrecheck[]) {
  const by: Record<Adapter, number> = { LOGICAL: 0, POLL: 0, KEY_DIFF: 0, NONE: 0 }
  for (const i of items) by[i.adapter]++
  return { tables: items.length, noPk: items.filter((i) => !i.pkYn).length, deleteUnseen: items.filter((i) => i.reasons.includes('DELETE_UNSEEN')).length, by }
}
