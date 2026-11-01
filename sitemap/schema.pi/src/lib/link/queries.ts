// 이름 붙인 조회(named query) 정본 — BUILD_CONTRACT §2.2, 결정 D2 : 임의 SQL 금지(EXPLAIN 은 SELECT/WITH 1문장, ANALYZE 없음)
// PostgreSQL 서버 직접(SRV, dbms_cd 0014) 접속만, READ ONLY 트랜잭션 + statement_timeout 5초 + lock_timeout 1초, 최대 500행. 행 데이터는 응답으로만(저장 없음, A3)
// 접속 열기 = SQL 편집기·모니터링과 같은 부품(getConn·connBlock·openPwd·resolveTarget·pgClient), 오류 원문은 maskErr(접속 주소·계정·비밀번호 가림)
import 'server-only'
import { z } from 'zod'
import { maskErr, pgClient, resolveTarget } from '../db-exec'
import { getConn } from '../model-ddl-req'
import { connBlock, openPwd } from '../secret'
import { cell, type Cell } from '../sql-run'
import type { LinkCode } from './auth'
import { explainTarget } from './rules'

export const MAX_ROWS = 500
const SYS_NS = `n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg_temp%' AND n.nspname NOT LIKE 'pg_toast_temp%'`
// $1 = schema(선택) · $2 = table(선택) · $3 = offset — 인자가 없는 조회는 아래 ARGS 에서 빈 배열
const Q = {
  db_stats: `SELECT d.datname, d.numbackends, d.xact_commit, d.xact_rollback, d.blks_read, d.blks_hit,
  round(100.0 * d.blks_hit / nullif(d.blks_hit + d.blks_read, 0), 2) AS cache_hit_pct, d.tup_returned, d.tup_fetched, d.tup_inserted, d.tup_updated, d.tup_deleted,
  d.conflicts, d.temp_files, d.temp_bytes, d.deadlocks, pg_database_size(d.datname) AS db_sz, d.stats_reset
FROM pg_stat_database d WHERE d.datname = current_database()`,
  top_sql: `SELECT s.queryid::text AS queryid, left(regexp_replace(s.query, '\\s+', ' ', 'g'), 1000) AS query, s.calls, round(s.total_exec_time::numeric, 2) AS total_ms, round(s.mean_exec_time::numeric, 3) AS mean_ms,
  round(s.max_exec_time::numeric, 2) AS max_ms, s.rows, s.shared_blks_hit, s.shared_blks_read, s.temp_blks_written
FROM pg_stat_statements s WHERE s.dbid = (SELECT oid FROM pg_database WHERE datname = current_database()) ORDER BY s.total_exec_time DESC LIMIT $1`,
  tbl_stats: `SELECT schemaname, relname, seq_scan, seq_tup_read, idx_scan, idx_tup_fetch, n_live_tup, n_dead_tup, n_mod_since_analyze, last_vacuum, last_autovacuum, last_analyze, last_autoanalyze, vacuum_count, autovacuum_count
FROM pg_stat_user_tables WHERE ($1::text IS NULL OR schemaname = $1) ORDER BY seq_tup_read DESC NULLS LAST, relname LIMIT ${MAX_ROWS} OFFSET $2`,
  idx_stats: `SELECT s.schemaname, s.relname, s.indexrelname, s.idx_scan, s.idx_tup_read, s.idx_tup_fetch, pg_relation_size(s.indexrelid) AS idx_sz, i.indisunique, i.indisprimary, i.indisvalid
FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid WHERE ($1::text IS NULL OR s.schemaname = $1) ORDER BY s.idx_scan NULLS FIRST, pg_relation_size(s.indexrelid) DESC LIMIT ${MAX_ROWS} OFFSET $2`,
  sizes: `SELECT n.nspname AS schemaname, c.relname, c.relkind, pg_total_relation_size(c.oid) AS total_sz, pg_relation_size(c.oid) AS tbl_sz, pg_indexes_size(c.oid) AS idx_sz,
  coalesce(pg_total_relation_size(c.reltoastrelid), 0) AS toast_sz, c.reltuples::bigint AS est_rows
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r', 'm', 'p') AND ${SYS_NS} AND ($1::text IS NULL OR n.nspname = $1)
ORDER BY pg_total_relation_size(c.oid) DESC LIMIT ${MAX_ROWS} OFFSET $2`,
  activity: `SELECT pid, usename, application_name, client_addr::text AS client_addr, backend_type, state, wait_event_type, wait_event, xact_start, query_start,
  round(extract(epoch FROM now() - query_start) * 1000)::bigint AS run_ms, left(regexp_replace(query, '\\s+', ' ', 'g'), 1000) AS query
FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() ORDER BY (state = 'idle'), query_start NULLS LAST LIMIT ${MAX_ROWS}`,
  locks: `SELECT l.pid, l.locktype, l.mode, l.granted, l.relation::regclass::text AS rel_nm, pg_blocking_pids(l.pid) AS blocked_by, a.usename, a.state,
  round(extract(epoch FROM now() - a.query_start) * 1000)::bigint AS run_ms, left(regexp_replace(a.query, '\\s+', ' ', 'g'), 500) AS query
FROM pg_locks l LEFT JOIN pg_stat_activity a ON a.pid = l.pid WHERE (l.database IS NULL OR l.database = (SELECT oid FROM pg_database WHERE datname = current_database())) AND l.pid <> pg_backend_pid()
ORDER BY l.granted, l.pid LIMIT ${MAX_ROWS}`,
  settings: `SELECT name, setting, unit, category, short_desc, source, boot_val, reset_val, pending_restart FROM pg_settings ORDER BY category, name LIMIT ${MAX_ROWS} OFFSET $1`,
  roles: `SELECT r.rolname, r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolbypassrls, r.rolconnlimit, r.rolvaliduntil,
  ARRAY(SELECT b.rolname FROM pg_auth_members m JOIN pg_roles b ON b.oid = m.roleid WHERE m.member = r.oid ORDER BY 1) AS member_of
FROM pg_roles r WHERE r.rolname NOT LIKE 'pg\\_%' ORDER BY r.rolname LIMIT ${MAX_ROWS} OFFSET $1`,
  table_privs: `SELECT grantee, table_schema, table_name, privilege_type, is_grantable FROM information_schema.role_table_grants
WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND ($1::text IS NULL OR table_schema = $1) ORDER BY table_schema, table_name, grantee, privilege_type LIMIT ${MAX_ROWS} OFFSET $2`,
  catalog_tables: `SELECT n.nspname AS schemaname, c.relname, c.relkind, c.reltuples::bigint AS est_rows, obj_description(c.oid, 'pg_class') AS cmnt
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r', 'v', 'm', 'p', 'f') AND ${SYS_NS} AND ($1::text IS NULL OR n.nspname = $1)
ORDER BY n.nspname, c.relname LIMIT ${MAX_ROWS} OFFSET $2`,
  catalog_columns: `SELECT n.nspname AS schemaname, c.relname, a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) AS data_tp, a.attnotnull, pg_get_expr(d.adbin, d.adrelid) AS dflt, col_description(c.oid, a.attnum) AS cmnt
FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relkind IN ('r', 'v', 'm', 'p', 'f') AND ${SYS_NS} AND ($1::text IS NULL OR n.nspname = $1) AND ($2::text IS NULL OR c.relname = $2)
ORDER BY n.nspname, c.relname, a.attnum LIMIT ${MAX_ROWS} OFFSET $3`,
  catalog_indexes: `SELECT n.nspname AS schemaname, t.relname, c.relname AS indexrelname, i.indisunique, i.indisprimary, i.indisvalid, pg_get_indexdef(i.indexrelid) AS idx_def, pg_relation_size(i.indexrelid) AS idx_sz
FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_class t ON t.oid = i.indrelid JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE ${SYS_NS} AND ($1::text IS NULL OR n.nspname = $1) AND ($2::text IS NULL OR t.relname = $2) ORDER BY n.nspname, t.relname, c.relname LIMIT ${MAX_ROWS} OFFSET $3`,
  replication: `SELECT pid, usename, application_name, client_addr::text AS client_addr, state, sync_state, sent_lsn::text, write_lsn::text, flush_lsn::text, replay_lsn::text,
  write_lag::text, flush_lag::text, replay_lag::text, pg_is_in_recovery() AS in_recovery FROM pg_stat_replication ORDER BY application_name LIMIT ${MAX_ROWS}`,
  archiver: `SELECT archived_count, last_archived_wal, last_archived_time, failed_count, last_failed_wal, last_failed_time, stats_reset, current_setting('archive_mode') AS archive_mode FROM pg_stat_archiver`,
  version: `SELECT version() AS version, current_setting('server_version_num')::int AS version_num, current_database() AS db_nm, pg_is_in_recovery() AS in_recovery,
  pg_postmaster_start_time() AS start_dtm, current_setting('max_connections')::int AS max_conn, current_setting('shared_buffers') AS shared_buffers`,
  explain: '', // 본문 = 'EXPLAIN (FORMAT JSON, COSTS true) ' + 검사 통과 문장
} as const
export type QueryName = keyof typeof Q
export const QUERY_NAMES = Object.keys(Q) as QueryName[]
export const isQueryName = (v: unknown): v is QueryName => typeof v === 'string' && Object.hasOwn(Q, v)

const ident = z.string().trim().min(1).max(128).nullish().transform((v) => v ?? null)
export const paramsSchema = z
  .object({ sql: z.string().max(20_000).optional(), schema: ident, table: ident, offset: z.number().int().min(0).max(1_000_000).default(0), limit: z.number().int().min(1).max(100).default(50) })
  .default({ schema: null, table: null, offset: 0, limit: 50 })
type Params = z.infer<typeof paramsSchema>

function argsOf(q: QueryName, p: Params): unknown[] {
  if (q === 'top_sql') return [p.limit]
  if (q === 'tbl_stats' || q === 'idx_stats' || q === 'sizes' || q === 'table_privs' || q === 'catalog_tables') return [p.schema, p.offset]
  if (q === 'catalog_columns' || q === 'catalog_indexes') return [p.schema, p.table, p.offset]
  if (q === 'settings' || q === 'roles') return [p.offset]
  return []
}

export type QueryRes = { cols: string[]; rows: Cell[][]; ms: number }
export type QueryFail = { fail: LinkCode; status: number; message?: string }

// 실행 — 이 분류체계 접속만(다른 분류체계 = LINK_SCOPE), SRV PostgreSQL 만
export async function runNamed(areaId: string, connId: string, q: QueryName, p: Params): Promise<QueryRes | QueryFail> {
  let text: string = Q[q]
  if (q === 'explain') {
    const s = p.sql ? explainTarget(p.sql) : null
    if (!s) return { fail: 'SQL_NOT_SELECT', status: 400 }
    text = `EXPLAIN (FORMAT JSON, COSTS true) ${s}`
  }
  const c = await getConn(areaId, connId)
  if (!c) return { fail: 'LINK_SCOPE', status: 403 }
  if (c.exec_mthd_cd !== 'SRV' || c.dbms_cd !== '0014') return { fail: 'CONN_UNSUPPORTED', status: 400 }
  if (connBlock()) return { fail: 'CONN_DISABLED', status: 503 }
  const pwd = c.pwd_enc_txt ? openPwd(areaId, c.conn_id, c.pwd_enc_txt) : null
  if (pwd == null) return { fail: 'CONN_FAIL', status: 400, message: '저장된 비밀번호를 열 수 없습니다 — schema.pi 접속 관리에서 비밀번호를 다시 입력하십시오' }
  const t = await resolveTarget(c)
  if (t === 'BLOCKED' || t === 'DNS') return { fail: 'CONN_FAIL', status: 400, message: t === 'DNS' ? '호스트 이름을 찾을 수 없습니다' : '허용되지 않은 접속 주소입니다' }
  const sql = pgClient(t, pwd)
  const t0 = Date.now()
  try {
    const r = await sql.begin('READ ONLY', async (tx) => {
      await tx.unsafe("SET LOCAL statement_timeout = '5s'")
      await tx.unsafe("SET LOCAL lock_timeout = '1s'")
      await tx.unsafe('SET LOCAL standard_conforming_strings = on') // explainTarget 의 문자열 가림과 같은 해석
      if (q === 'top_sql') {
        const ok = await tx.unsafe("SELECT to_regclass('pg_stat_statements') IS NOT NULL AS ok")
        if (!(ok[0] as unknown as { ok: boolean }).ok) return 'PGSS' as const
      }
      // 확장 프로토콜 고정(인자 0개면 postgres.js 가 simple 로 보내 여러 문장 실행) — Parse 가 다중 문장을 거부해 마스킹 해석 차이와 무관하게 차단
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return tx.unsafe(text, argsOf(q, p) as any[], { simple: false } as any).values()
    })
    if (r === 'PGSS') return { fail: 'PGSS_MISSING', status: 400 }
    const rows = (r as unknown as unknown[][]).slice(0, MAX_ROWS).map((x) => x.map(cell))
    return { cols: (r.columns ?? []).map((x: { name: string }) => x.name), rows, ms: Date.now() - t0 }
  } catch (e) {
    const x = e as { code?: string; message?: string }
    if (x.code === '57014') return { fail: 'TIMEOUT', status: 504 }
    if (q === 'top_sql' && (x.code === '42P01' || x.code === '55000')) return { fail: 'PGSS_MISSING', status: 400 } // 확장은 있으나 preload 안 됨
    return { fail: 'CONN_FAIL', status: 400, message: maskErr(x.message ?? e, [t.host, t.ip, t.usr, t.db, pwd]) }
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {})
  }
}
