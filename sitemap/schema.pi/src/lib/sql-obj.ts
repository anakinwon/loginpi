// SQL 편집기 테이블 객체 편집기(서버 전용, 2026-10-20 마스터 지시 "DBeaver 와 동일 기능") — Properties 섹션·Data·ER Diagram 을 섹션별 지연 조회
// 카탈로그 = 고정 SQL + 바인드(스키마·이름 → pg_class 로 oid 확인 후 oid 바인드). data·count 만 동적 SQL — 카탈로그가 돌려준 이름을 항상 인용(qid)해 조립
// PostgreSQL = READ ONLY 트랜잭션 + SET LOCAL statement_timeout, Oracle = head·cols·stats·ddl(DBMS_METADATA)·data·count 만(나머지 NOT_SUPPORTED)
import 'server-only'
import { NextResponse } from 'next/server'
import { apiError, dbError, type ErrorCode } from './api'
import { db } from './db'
import { STMT_MS, maskErr, pgClient, type Target } from './db-exec'
import { cell, openConn, type Cell } from './sql-run'
import { buildDdl, qid, type DdlIn } from './sql-obj-ddl'
import type { Perm } from './roles'

export const OBJ_LIST = ['cols', 'cons', 'fks', 'idx', 'deps', 'refs', 'parts', 'trg', 'rules', 'pol', 'grants', 'stats'] as const
export const OBJ_SECS = ['head', ...OBJ_LIST, 'count', 'ddl', 'data', 'erd'] as const
export type ObjSec = (typeof OBJ_SECS)[number]
type ListSec = (typeof OBJ_LIST)[number]
export interface ObjQuery {
  sec: ObjSec
  schema: string
  rel: string
  page: number
  size: number
}
type Row = Record<string, Cell>
type Out = Record<string, unknown> | ErrorCode
const DATA_KINDS = 'rpvmf'
const ERD_NB_MAX = 50 // ponytail: 이웃 테이블 50개까지(공통 코드 테이블처럼 피참조가 수백이면 잘림) — 필요 시 화면에 '더 있음' 표시 추가
const ERD_COL_MAX = 30

// 배열(conkey 등) → 칼럼명 목록(배열 순서 유지)
const colsOf = (arr: string, rel: string) => `(SELECT string_agg(a.attname, ', ' ORDER BY k.o) FROM unnest(${arr}) WITH ORDINALITY k(n, o) JOIN pg_attribute a ON a.attrelid = ${rel} AND a.attnum = k.n)`
const colArr = (arr: string, rel: string) => `ARRAY(SELECT a.attname::text FROM unnest(${arr}) WITH ORDINALITY k(n, o) JOIN pg_attribute a ON a.attrelid = ${rel} AND a.attnum = k.n ORDER BY k.o)`
const fkAct = (c: string) => `CASE ${c} WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END`
const isKey = (ty: string) => `EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = a.attrelid AND k.contype = '${ty}' AND a.attnum = ANY (k.conkey))`

const RESOLVE = `SELECT c.oid::int8::text AS oid, c.relkind::text AS kind, n.nspname AS schema, c.relname AS name
                   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind IN ('r','p','v','m','f','S')`
const HEAD = `SELECT c.relname AS name, c.oid::int8 AS oid, c.relkind::text AS kind, pg_get_userbyid(c.relowner) AS owner, COALESCE(t.spcname, '(default)') AS tablespace,
                     c.relrowsecurity AS rls, (c.relkind = 'p') AS partitioned, CASE WHEN c.relkind = 'p' THEN pg_get_partkeydef(c.oid) END AS partition_by,
                     array_to_string(c.reloptions, ', ') AS options, obj_description(c.oid, 'pg_class') AS comment,
                     CASE WHEN c.reltuples < 0 THEN NULL ELSE c.reltuples::int8 END AS est_rows,
                     CASE WHEN c.relkind IN ('r','p','m','f','S') THEN pg_size_pretty(pg_total_relation_size(c.oid)) END AS size
                FROM pg_class c LEFT JOIN pg_tablespace t ON t.oid = c.reltablespace WHERE c.oid = $1::oid`
// DDL 전용 머리 정보(상속·파티션 부모·뷰 정의·외부 서버·시퀀스)
const DDL_HEAD = `SELECT c.relkind::text AS kind, c.relpersistence::text AS persistence, pg_get_userbyid(c.relowner) AS owner, t.spcname AS tablespace, c.relrowsecurity AS rls,
                         CASE WHEN c.relkind = 'p' THEN pg_get_partkeydef(c.oid) END AS part_key, c.reloptions AS options, obj_description(c.oid, 'pg_class') AS comment,
                         (SELECT amname FROM pg_am WHERE oid = c.relam AND amname <> 'heap' AND c.relkind IN ('r','p','m')) AS am,
                         CASE WHEN c.relispartition THEN pg_get_expr(c.relpartbound, c.oid, true) END AS part_bound,
                         (SELECT json_agg(json_build_object('schema', pn.nspname, 'name', pc.relname) ORDER BY i.inhseqno)
                            FROM pg_inherits i JOIN pg_class pc ON pc.oid = i.inhparent JOIN pg_namespace pn ON pn.oid = pc.relnamespace WHERE i.inhrelid = c.oid) AS inh,
                         CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid, true) END AS view_def,
                         (SELECT json_build_object('server', s.srvname, 'options', ft.ftoptions) FROM pg_foreign_table ft JOIN pg_foreign_server s ON s.oid = ft.ftserver WHERE ft.ftrelid = c.oid) AS ft,
                         (SELECT json_build_object('type', format_type(q.seqtypid, NULL), 'start', q.seqstart::text, 'inc', q.seqincrement::text, 'min', q.seqmin::text, 'max', q.seqmax::text, 'cache', q.seqcache::text, 'cycle', q.seqcycle)
                            FROM pg_sequence q WHERE q.seqrelid = c.oid) AS seq,
                         (c.relacl IS NULL) AS acl_dflt
                    FROM pg_class c LEFT JOIN pg_tablespace t ON t.oid = c.reltablespace WHERE c.oid = $1::oid`

// 목록 섹션 — 표시 열 순서·한국어 라벨(DBeaver @Property order, ko 번들 있는 라벨은 그 문구)
const LIST: Record<Exclude<ListSec, 'stats'>, { cols: [string, string][]; sql: string }> = {
  cols: {
    cols: [['name', '컬럼명'], ['num', '#'], ['type', '데이터 유형'], ['identity', '식별자'], ['collation', '콜레이션'], ['nn', 'Not Null'], ['default', '디폴트'], ['comment', '코멘트']],
    sql: `SELECT a.attname AS name, a.attnum AS num, format_type(a.atttypid, a.atttypmod) AS type,
                 CASE a.attidentity WHEN 'a' THEN 'ALWAYS' WHEN 'd' THEN 'BY DEFAULT' END AS identity, co.collname AS collation, a.attnotnull AS nn,
                 pg_get_expr(ad.adbin, ad.adrelid, true) AS default, col_description(a.attrelid, a.attnum) AS comment,
                 ${isKey('p')} AS pk, ${isKey('f')} AS fk,
                 (a.attgenerated = 's') AS gen, a.attislocal AS local, (a.attcollation <> ty.typcollation) AS coll_set
            FROM pg_attribute a JOIN pg_type ty ON ty.oid = a.atttypid
            LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
            LEFT JOIN pg_collation co ON co.oid = a.attcollation AND a.attcollation <> 0
           WHERE a.attrelid = $1::oid AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`,
  },
  cons: {
    cols: [['name', '이름'], ['type', '유형'], ['columns', '칼럼'], ['definition', '표현식'], ['comment', '코멘트']],
    sql: `SELECT c.conname AS name, CASE c.contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'u' THEN 'UNIQUE' WHEN 'c' THEN 'CHECK' WHEN 'x' THEN 'EXCLUDE' END AS type,
                 ${colsOf('c.conkey', 'c.conrelid')} AS columns, pg_get_constraintdef(c.oid, true) AS definition, obj_description(c.oid, 'pg_constraint') AS comment
            FROM pg_constraint c WHERE c.conrelid = $1::oid AND c.contype IN ('p','u','c','x')
           ORDER BY CASE c.contype WHEN 'p' THEN 0 WHEN 'u' THEN 1 WHEN 'x' THEN 2 ELSE 3 END, c.conname`,
  },
  fks: {
    cols: [['name', '이름'], ['columns', '칼럼'], ['ref_schema', '참조 스키마'], ['ref_table', '참조 테이블'], ['ref_columns', '참조 칼럼'], ['match', '매치 유형'], ['on_delete', '삭제 규칙'], ['on_update', '갱신 규칙'], ['deferrable', '지연 가능'], ['definition', '정의']],
    sql: `SELECT c.conname AS name, ${colsOf('c.conkey', 'c.conrelid')} AS columns, rn.nspname AS ref_schema, rc.relname AS ref_table, ${colsOf('c.confkey', 'c.confrelid')} AS ref_columns,
                 ${fkAct('c.confupdtype')} AS on_update, ${fkAct('c.confdeltype')} AS on_delete, CASE c.confmatchtype WHEN 'f' THEN 'FULL' WHEN 'p' THEN 'PARTIAL' ELSE 'SIMPLE' END AS match,
                 c.condeferrable AS deferrable, pg_get_constraintdef(c.oid, true) AS definition, obj_description(c.oid, 'pg_constraint') AS comment
            FROM pg_constraint c JOIN pg_class rc ON rc.oid = c.confrelid JOIN pg_namespace rn ON rn.oid = rc.relnamespace
           WHERE c.conrelid = $1::oid AND c.contype = 'f' ORDER BY c.conname`,
  },
  idx: {
    cols: [['name', '인덱스명'], ['columns', '칼럼'], ['unique', '유일'], ['primary', '기본 키'], ['predicate', '조건식'], ['size', '크기'], ['method', '접근 방식'], ['scans', '스캔 수'], ['definition', '정의'], ['comment', '코멘트']],
    sql: `SELECT ic.relname AS name, n.nspname AS schema, i.indisunique AS unique, i.indisprimary AS primary, am.amname AS method,
                 array_to_string(ARRAY(SELECT pg_get_indexdef(i.indexrelid, k, true) FROM generate_series(1, i.indnkeyatts) k), ', ') AS columns,
                 pg_get_expr(i.indpred, i.indrelid, true) AS predicate, pg_size_pretty(pg_relation_size(i.indexrelid)) AS size, pg_stat_get_numscans(i.indexrelid) AS scans,
                 pg_get_indexdef(i.indexrelid) AS definition, obj_description(i.indexrelid, 'pg_class') AS comment,
                 EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conindid = i.indexrelid AND k.conrelid = i.indrelid AND k.contype IN ('p','u','x')) AS con
            FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid JOIN pg_namespace n ON n.oid = ic.relnamespace JOIN pg_am am ON am.oid = ic.relam
           WHERE i.indrelid = $1::oid ORDER BY i.indisprimary DESC, ic.relname`,
  },
  // 이 테이블에 의존하는 객체(pg_depend 역방향, DBeaver PostgreDependency 간소화) — 뷰는 _RETURN 룰 대신 뷰 자신으로
  deps: {
    cols: [['name', '이름'], ['type', '유형'], ['schema', '스키마'], ['dep_type', '의존 유형']],
    sql: `SELECT DISTINCT o.identity AS name, o.type, o.schema,
                 CASE d.deptype WHEN 'n' THEN 'NORMAL' WHEN 'a' THEN 'AUTO' WHEN 'i' THEN 'INTERNAL' WHEN 'e' THEN 'EXTENSION' WHEN 'x' THEN 'AUTO EXTENSION' ELSE d.deptype::text END AS dep_type
            FROM pg_depend d
            LEFT JOIN pg_rewrite rw ON d.classid = 'pg_rewrite'::regclass AND rw.oid = d.objid
           CROSS JOIN LATERAL pg_identify_object(CASE WHEN rw.oid IS NULL THEN d.classid ELSE 'pg_class'::regclass END, COALESCE(rw.ev_class, d.objid), CASE WHEN rw.oid IS NULL THEN d.objsubid ELSE 0 END) o
           WHERE d.refclassid = 'pg_class'::regclass AND d.refobjid = $1::oid AND COALESCE(rw.ev_class, 0) <> d.refobjid
           ORDER BY 2, 1`,
  },
  refs: {
    cols: [['name', '이름'], ['from_schema', '참조하는 스키마'], ['from_table', '참조하는 테이블'], ['from_columns', '참조하는 칼럼'], ['columns', '대상 칼럼'], ['on_delete', '삭제 규칙'], ['on_update', '갱신 규칙']],
    sql: `SELECT c.conname AS name, fn.nspname AS from_schema, fc.relname AS from_table, ${colsOf('c.conkey', 'c.conrelid')} AS from_columns, ${colsOf('c.confkey', 'c.confrelid')} AS columns,
                 ${fkAct('c.confdeltype')} AS on_delete, ${fkAct('c.confupdtype')} AS on_update
            FROM pg_constraint c JOIN pg_class fc ON fc.oid = c.conrelid JOIN pg_namespace fn ON fn.oid = fc.relnamespace
           WHERE c.confrelid = $1::oid AND c.contype = 'f' ORDER BY 2, 3, 1`,
  },
  parts: {
    cols: [['schema', '스키마'], ['name', '테이블명'], ['bound', '파티션 범위'], ['size', '크기']],
    sql: `SELECT n.nspname AS schema, c.relname AS name, pg_get_expr(c.relpartbound, c.oid, true) AS bound, pg_size_pretty(pg_total_relation_size(c.oid)) AS size
            FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE i.inhparent = $1::oid ORDER BY 1, 2`,
  },
  trg: {
    cols: [['name', '이름'], ['timing', '시점'], ['events', '이벤트'], ['level', '유형'], ['enabled', '활성'], ['function', '함수'], ['definition', '정의'], ['comment', '설명']],
    sql: `SELECT t.tgname AS name,
                 CASE WHEN t.tgtype::int & 2 <> 0 THEN 'BEFORE' WHEN t.tgtype::int & 64 <> 0 THEN 'INSTEAD OF' ELSE 'AFTER' END AS timing,
                 concat_ws(' OR ', CASE WHEN t.tgtype::int & 4 <> 0 THEN 'INSERT' END, CASE WHEN t.tgtype::int & 16 <> 0 THEN 'UPDATE' END,
                           CASE WHEN t.tgtype::int & 8 <> 0 THEN 'DELETE' END, CASE WHEN t.tgtype::int & 32 <> 0 THEN 'TRUNCATE' END) AS events,
                 CASE WHEN t.tgtype::int & 1 <> 0 THEN 'ROW' ELSE 'STATEMENT' END AS level,
                 CASE t.tgenabled WHEN 'O' THEN 'ENABLED' WHEN 'D' THEN 'DISABLED' WHEN 'R' THEN 'REPLICA' WHEN 'A' THEN 'ALWAYS' END AS enabled,
                 t.tgfoid::regprocedure::text AS function, pg_get_triggerdef(t.oid, true) AS definition, obj_description(t.oid, 'pg_trigger') AS comment
            FROM pg_trigger t WHERE t.tgrelid = $1::oid AND NOT t.tgisinternal ORDER BY t.tgname`,
  },
  rules: {
    cols: [['name', '이름'], ['event', '유형'], ['instead', 'INSTEAD'], ['definition', '정의']],
    sql: `SELECT r.rulename AS name, CASE r.ev_type WHEN '1' THEN 'SELECT' WHEN '2' THEN 'UPDATE' WHEN '3' THEN 'INSERT' WHEN '4' THEN 'DELETE' END AS event,
                 r.is_instead AS instead, pg_get_ruledef(r.oid, true) AS definition
            FROM pg_rewrite r WHERE r.ev_class = $1::oid AND r.rulename <> '_RETURN' ORDER BY 1`,
  },
  pol: {
    cols: [['name', '이름'], ['roles', '역할'], ['permissive', '유형'], ['command', '이벤트'], ['using', 'USING'], ['with_check', 'WITH CHECK']],
    sql: `SELECT p.polname AS name, CASE WHEN p.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END AS permissive,
                 CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END AS command,
                 CASE WHEN p.polroles = '{0}' THEN 'PUBLIC' ELSE array_to_string(ARRAY(SELECT quote_ident(rolname) FROM pg_roles WHERE oid = ANY (p.polroles) ORDER BY rolname), ', ') END AS roles,
                 pg_get_expr(p.polqual, p.polrelid, true) AS "using", pg_get_expr(p.polwithcheck, p.polrelid, true) AS with_check
            FROM pg_policy p WHERE p.polrelid = $1::oid ORDER BY 1`,
  },
  // 테이블 relacl(없으면 소유자 기본 권한) + 칼럼 attacl
  grants: {
    cols: [['grantee', '권한 받는 역할'], ['column', '칼럼'], ['privilege', '권한'], ['grantable', 'With GRANT'], ['grantor', '부여자']],
    sql: `SELECT COALESCE(r.rolname, 'PUBLIC') AS grantee, NULL::text AS "column", x.privilege_type AS privilege, x.is_grantable AS grantable, g.rolname AS grantor
            FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's' ELSE 'r' END::"char", c.relowner))) x
            LEFT JOIN pg_roles r ON r.oid = x.grantee LEFT JOIN pg_roles g ON g.oid = x.grantor
           WHERE c.oid = $1::oid
          UNION ALL
          SELECT COALESCE(r.rolname, 'PUBLIC'), a.attname::text, x.privilege_type, x.is_grantable, g.rolname
            FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x
            LEFT JOIN pg_roles r ON r.oid = x.grantee LEFT JOIN pg_roles g ON g.oid = x.grantor
           WHERE a.attrelid = $1::oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
           ORDER BY 2 NULLS FIRST, 1, 3`,
  },
}
// Statistics — DBeaver 4항목(추정 행 수·디스크·테이블 크기) + 확장(인덱스·TOAST·vacuum/analyze·스캔·튜플, DBeaver 에는 없음)
const STATS_SQL = `SELECT CASE WHEN c.reltuples < 0 THEN NULL ELSE c.reltuples::int8 END AS est_rows, pg_size_pretty(pg_total_relation_size(c.oid)) AS total,
                          pg_size_pretty(pg_relation_size(c.oid)) AS rel, pg_size_pretty(pg_indexes_size(c.oid)) AS idx,
                          pg_size_pretty(GREATEST(pg_total_relation_size(c.oid) - pg_relation_size(c.oid) - pg_indexes_size(c.oid), 0)) AS toast,
                          s.last_vacuum, s.last_autovacuum, s.last_analyze, s.last_autoanalyze, s.seq_scan, s.idx_scan, s.n_live_tup, s.n_dead_tup
                     FROM pg_class c LEFT JOIN pg_stat_all_tables s ON s.relid = c.oid WHERE c.oid = $1::oid`
const STATS_LBL: [string, string][] = [
  ['est_rows', '추정 행 수'], ['total', '디스크 사용량(전체)'], ['rel', '테이블 크기'], ['idx', '인덱스 크기'], ['toast', 'TOAST 크기'],
  ['last_vacuum', '마지막 VACUUM'], ['last_autovacuum', '마지막 AUTOVACUUM'], ['last_analyze', '마지막 ANALYZE'], ['last_autoanalyze', '마지막 AUTOANALYZE'],
  ['seq_scan', '순차 스캔 수'], ['idx_scan', '인덱스 스캔 수'], ['n_live_tup', '살아 있는 튜플 수'], ['n_dead_tup', '죽은 튜플 수'],
  // Oracle
  ['num_rows', '행 수(통계)'], ['blocks', '블록 수'], ['avg_row_len', '평균 행 길이'], ['last_analyzed', '마지막 통계 수집'],
]
const STATS_COLS = [{ key: 'item', label: '항목' }, { key: 'value', label: '값' }]
const toStats = (r: Row | undefined) => (r ? STATS_LBL.filter(([k]) => k in r).map(([k, label]) => ({ item: label, value: r[k] })) : [])
const conv = (rows: unknown[]) => (rows as Record<string, unknown>[]).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, cell(v)])) as Row)
// Cell 대신 원값(배열·json·bool) 그대로 쓰는 DDL·ERD 용
type Raw = Record<string, unknown>

// ── PostgreSQL ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any
async function pgObj(tx: Tx, q: ObjQuery): Promise<Out> {
  const [o] = (await tx.unsafe(RESOLVE, [q.schema, q.rel])) as { oid: string; kind: string; schema: string; name: string }[]
  if (!o) return 'NOT_FOUND'
  const id = [o.oid]
  const run = async (sql: string) => (await tx.unsafe(sql, id)) as Raw[]
  if (q.sec === 'head') {
    const [h] = conv(await run(HEAD))
    return { item: h }
  }
  if (q.sec === 'stats') return { sec: 'stats', columns: STATS_COLS, items: toStats(conv(await run(STATS_SQL))[0]) }
  if (q.sec in LIST) {
    const s = LIST[q.sec as keyof typeof LIST]
    return { sec: q.sec, columns: s.cols.map(([key, label]) => ({ key, label })), items: conv(await run(s.sql)) }
  }
  const ident = `${qid(o.schema)}.${qid(o.name)}` // 카탈로그가 돌려준 이름만 인용해 조립
  if (q.sec === 'count') {
    if (!DATA_KINDS.includes(o.kind)) return 'NOT_SUPPORTED'
    const [r] = await tx.unsafe(`SELECT count(*)::int8 AS n FROM ${ident}`)
    return { count: cell(r.n) }
  }
  if (q.sec === 'data') {
    if (!DATA_KINDS.includes(o.kind)) return 'NOT_SUPPORTED'
    const types = new Map((await run(LIST.cols.sql)).map((c) => [String(c.name), String(c.type)]))
    const r = await tx.unsafe(`SELECT * FROM ${ident} LIMIT $1 OFFSET $2`, [q.size + 1, (q.page - 1) * q.size]).values()
    const rows = (r as unknown[][]).slice(0, q.size).map((x) => x.map(cell))
    return { columns: (r.columns ?? []).map((c: { name: string }) => ({ name: c.name, type: types.get(c.name) ?? '' })), rows, page: q.page, size: q.size, more: r.length > q.size }
  }
  if (q.sec === 'ddl') return { ddl: await pgDdl(run, o) }
  return { ...(await pgErd(tx, o.oid)) }
}

async function pgDdl(run: (sql: string) => Promise<Raw[]>, o: { kind: string; schema: string; name: string }): Promise<string> {
  const [h] = await run(DDL_HEAD)
  const [cols, cons, fks, idx, trg, rules, pol, grants] = await Promise.all([LIST.cols, LIST.cons, LIST.fks, LIST.idx, LIST.trg, LIST.rules, LIST.pol, LIST.grants].map((s) => run(s.sql)))
  const s = (v: unknown) => (v == null ? null : String(v))
  const inh = (h.inh as { schema: string; name: string }[] | null) ?? []
  const ft = h.ft as { server: string; options: string[] | null } | null
  const inp: DdlIn = {
    schema: o.schema,
    name: o.name,
    kind: o.kind,
    persistence: String(h.persistence),
    owner: s(h.owner),
    tablespace: s(h.tablespace),
    am: s(h.am),
    rls: !!h.rls,
    partKey: s(h.part_key),
    partOf: h.part_bound != null && inh[0] ? { ...inh[0], bound: String(h.part_bound) } : null,
    inherits: h.part_bound != null ? [] : inh,
    options: (h.options as string[] | null) ?? null,
    comment: s(h.comment),
    viewDef: s(h.view_def),
    foreign: ft,
    seq: (h.seq as DdlIn['seq']) ?? null,
    cols: cols.map((c) => ({ name: String(c.name), type: String(c.type), collation: c.coll_set ? s(c.collation) : null, nn: !!c.nn, default: s(c.default), identity: c.identity === 'ALWAYS' ? 'a' : c.identity === 'BY DEFAULT' ? 'd' : null, generated: !!c.gen, local: !!c.local, comment: s(c.comment) })),
    cons: cons.map((c) => ({ name: String(c.name), definition: String(c.definition), comment: s(c.comment) })),
    fks: fks.map((c) => ({ name: String(c.name), definition: String(c.definition), comment: s(c.comment) })),
    idx: idx.filter((i) => !i.con).map((i) => ({ name: String(i.name), schema: String(i.schema), definition: String(i.definition), comment: s(i.comment) })),
    trg: trg.map((t) => ({ name: String(t.name), definition: String(t.definition), comment: s(t.comment) })),
    rules: rules.map((r) => ({ definition: String(r.definition) })),
    pol: pol.map((p) => ({ name: String(p.name), permissive: String(p.permissive), command: String(p.command), roles: String(p.roles), using: s(p.using), with_check: s(p.with_check) })),
    // 기본 ACL(relacl NULL)이면 테이블 GRANT 생략 — 칼럼 권한은 항상
    grants: grants.filter((g) => !(h.acl_dflt && g.column == null)).map((g) => ({ grantee: String(g.grantee), privilege: String(g.privilege), grantable: !!g.grantable, column: s(g.column) })),
  }
  return buildDdl(inp)
}

// ER Diagram — 대상 + FK 1단계 이웃(참조·피참조), 관계선 = 모은 테이블 사이 FK 전부(DBeaver collectDatabaseTables)
async function pgErd(tx: Tx, oid: string) {
  const NB = `SELECT $1::oid AS oid UNION
              (SELECT x FROM (SELECT confrelid AS x FROM pg_constraint WHERE contype = 'f' AND conrelid = $1::oid
                              UNION SELECT conrelid FROM pg_constraint WHERE contype = 'f' AND confrelid = $1::oid) y WHERE x <> $1::oid ORDER BY x LIMIT ${ERD_NB_MAX})`
  const cols = (await tx.unsafe(
    `WITH nb AS (${NB})
     SELECT n.nspname AS schema, c.relname AS tbl, (c.oid = $1::oid) AS self, a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS nn, ${isKey('p')} AS pk, ${isKey('f')} AS fk
       FROM nb JOIN pg_class c ON c.oid = nb.oid JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY self DESC, 1, 2, a.attnum`,
    [oid],
  )) as Raw[]
  const rels = (await tx.unsafe(
    `WITH nb AS (${NB})
     SELECT c.conname AS name, fn.nspname AS fs, fc.relname AS ft, ${colArr('c.conkey', 'c.conrelid')} AS fcols, tn.nspname AS ts, tc.relname AS tt, ${colArr('c.confkey', 'c.confrelid')} AS tcols
       FROM pg_constraint c JOIN pg_class fc ON fc.oid = c.conrelid JOIN pg_namespace fn ON fn.oid = fc.relnamespace JOIN pg_class tc ON tc.oid = c.confrelid JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE c.contype = 'f' AND c.conrelid IN (SELECT oid FROM nb) AND c.confrelid IN (SELECT oid FROM nb) ORDER BY 1`,
    [oid],
  )) as Raw[]
  const tables = new Map<string, { schema: string; name: string; cols: { name: string; type: string; pk: boolean; fk: boolean; nn: boolean }[] }>()
  for (const c of cols) {
    const k = `${c.schema}.${c.tbl}`
    const t = tables.get(k) ?? tables.set(k, { schema: String(c.schema), name: String(c.tbl), cols: [] }).get(k)!
    if (!c.self && (!(c.pk || c.fk) || t.cols.length >= ERD_COL_MAX)) continue // 이웃 = PK·FK 칼럼만, 30칼럼까지
    t.cols.push({ name: String(c.name), type: String(c.type), pk: !!c.pk, fk: !!c.fk, nn: !!c.nn })
  }
  return {
    tables: [...tables.values()],
    rels: rels.map((r) => ({ name: String(r.name), from: { schema: String(r.fs), table: String(r.ft), columns: r.fcols as string[] }, to: { schema: String(r.ts), table: String(r.tt), columns: r.tcols as string[] } })),
  }
}

// ── Oracle(조회만 — 나머지 섹션 NOT_SUPPORTED) ──
const ORA_KIND: Record<string, string> = { TABLE: 'r', VIEW: 'v', 'MATERIALIZED VIEW': 'm', SEQUENCE: 'S' }
const ORA_TYPE = `c.data_type || CASE WHEN c.data_type IN ('VARCHAR2','CHAR','NVARCHAR2','NCHAR','RAW') THEN '(' || c.char_length || ')' WHEN c.data_type = 'NUMBER' AND c.data_precision IS NOT NULL THEN '(' || c.data_precision || ',' || c.data_scale || ')' END`
const ORA_KEY = (ty: string) =>
  `CASE WHEN EXISTS (SELECT 1 FROM all_constraints k JOIN all_cons_columns kc ON kc.owner = k.owner AND kc.constraint_name = k.constraint_name WHERE k.owner = c.owner AND k.table_name = c.table_name AND k.constraint_type = '${ty}' AND kc.column_name = c.column_name) THEN 1 ELSE 0 END`
const ORA_SQL = {
  resolve: `SELECT object_type FROM all_objects WHERE owner = :1 AND object_name = :2 AND object_type IN ('TABLE','VIEW','MATERIALIZED VIEW','SEQUENCE') ORDER BY DECODE(object_type, 'MATERIALIZED VIEW', 0, 1)`,
  head: `SELECT o.object_name AS name, o.object_id AS oid, o.owner AS owner, t.tablespace_name AS tablespace, t.partitioned AS partitioned, t.num_rows AS est_rows, m.comments AS cmt
           FROM all_objects o LEFT JOIN all_tables t ON t.owner = o.owner AND t.table_name = o.object_name
           LEFT JOIN all_tab_comments m ON m.owner = o.owner AND m.table_name = o.object_name
          WHERE o.owner = :1 AND o.object_name = :2 AND o.object_type = :3`,
  cols: `SELECT c.column_name AS name, c.column_id AS num, ${ORA_TYPE} AS type, CASE c.identity_column WHEN 'YES' THEN 'IDENTITY' END AS identity, NULL AS collation,
                CASE c.nullable WHEN 'N' THEN 1 ELSE 0 END AS nn, c.data_default AS dflt, m.comments AS cmt, ${ORA_KEY('P')} AS pk, ${ORA_KEY('R')} AS fk
           FROM all_tab_columns c LEFT JOIN all_col_comments m ON m.owner = c.owner AND m.table_name = c.table_name AND m.column_name = c.column_name
          WHERE c.owner = :1 AND c.table_name = :2 ORDER BY c.column_id`,
  stats: `SELECT num_rows, blocks, avg_row_len, last_analyzed FROM all_tables WHERE owner = :1 AND table_name = :2`,
  ddl: `SELECT DBMS_METADATA.GET_DDL(:1, :2, :3) AS ddl FROM dual`,
}

async function oraObj(t: Target, pwd: string, q: ObjQuery): Promise<Out> {
  const ora = (await import('oracledb')).default
  const fetchTypeHandler = (m: { dbType?: unknown }) => (m.dbType === ora.DB_TYPE_CLOB || m.dbType === ora.DB_TYPE_NCLOB ? { type: ora.STRING } : m.dbType === ora.DB_TYPE_BLOB ? { type: ora.BUFFER } : undefined)
  const cn = await ora.getConnection({ user: t.usr, password: pwd, connectString: `${t.ip}:${t.port}/${t.db}`, connectTimeout: 10 })
  try {
    cn.callTimeout = STMT_MS
    const exec = async (sql: string, args: unknown[], maxRows = 20000) => {
      const r = await cn.execute(sql, args as never[], { maxRows, outFormat: ora.OUT_FORMAT_ARRAY, fetchTypeHandler })
      const names = (r.metaData ?? []).map((m) => m.name.toLowerCase())
      return { meta: r.metaData ?? [], rows: (r.rows ?? []) as unknown[][], objs: ((r.rows ?? []) as unknown[][]).map((x) => Object.fromEntries(names.map((n, i) => [n, cell(x[i])])) as Row) }
    }
    const typ = (await exec(ORA_SQL.resolve, [q.schema, q.rel], 1)).rows[0]?.[0] as string | undefined
    if (!typ) return 'NOT_FOUND'
    const kind = ORA_KIND[typ]
    const args = [q.schema, q.rel]
    const ident = `${qid(q.schema)}.${qid(q.rel)}` // resolve 로 존재 확인된 이름 — Oracle 은 바인드 값과 카탈로그 값이 같음(정확 일치)
    const flag = (v: Cell) => v === 1 || v === '1'
    switch (q.sec) {
      case 'head': {
        const h = (await exec(ORA_SQL.head, [...args, typ])).objs[0]
        return { item: { name: h.name, oid: h.oid, kind, owner: h.owner, tablespace: h.tablespace, rls: false, partitioned: h.partitioned === 'YES', partition_by: null, options: null, comment: h.cmt, est_rows: h.est_rows, size: null } }
      }
      case 'cols': {
        const items = (await exec(ORA_SQL.cols, args)).objs.map(({ dflt, cmt, ...r }) => ({ ...r, default: typeof dflt === 'string' ? dflt.trim() : dflt, comment: cmt, nn: flag(r.nn), pk: flag(r.pk), fk: flag(r.fk) }))
        return { sec: 'cols', columns: LIST.cols.cols.map(([key, label]) => ({ key, label })), items }
      }
      case 'stats':
        return { sec: 'stats', columns: STATS_COLS, items: toStats((await exec(ORA_SQL.stats, args)).objs[0]) }
      case 'ddl':
        return { ddl: String((await exec(ORA_SQL.ddl, [typ.replace(' ', '_'), q.rel, q.schema])).rows[0]?.[0] ?? '') }
      case 'count': {
        if (kind === 'S') return 'NOT_SUPPORTED'
        return { count: cell((await exec(`SELECT COUNT(*) FROM ${ident}`, [])).rows[0]?.[0]) }
      }
      case 'data': {
        if (kind === 'S') return 'NOT_SUPPORTED'
        const r = await exec(`SELECT * FROM ${ident} OFFSET :1 ROWS FETCH NEXT :2 ROWS ONLY`, [(q.page - 1) * q.size, q.size + 1], q.size + 1)
        return { columns: r.meta.map((m) => ({ name: m.name, type: m.dbTypeName ?? '' })), rows: r.rows.slice(0, q.size).map((x) => x.map(cell)), page: q.page, size: q.size, more: r.rows.length > q.size }
      }
      default:
        return 'NOT_SUPPORTED'
    }
  } finally {
    await cn.close().catch(() => {})
  }
}

// 시스템 스키마(PG pg_*·information_schema, ORA SYS·SYSTEM) 객체는 열지 않음 — 탐색기에도 없고, pg_authid 같은 계정 카탈로그(비밀번호 해시)가 Data 탭으로 노출되지 않게(2026-10-20 검증 지적)
const SYS_SCHEMA = (s: string) => /^pg_/i.test(s) || /^(information_schema|sys|system)$/i.test(s)

export async function getObj(areaId: string, connId: string, perms: readonly Perm[], q: ObjQuery, uid: string): Promise<NextResponse> {
  if (SYS_SCHEMA(q.schema)) return apiError('NOT_SUPPORTED', 400)
  const oc = await openConn(areaId, connId, perms)
  if (oc instanceof NextResponse) return oc
  const { d, t, pwd } = oc
  const hide = [t.host, t.ip, t.usr, t.db, pwd]
  // 데이터·건수 조회 = 사용자 데이터 열람이라 SQL 실행 이력에 남김(편집기 실행과 같은 fail-closed 선기록 — 기록이 안 되면 조회 안 함, 2026-10-20 보안 검토)
  let hid: string | null = null
  const t0 = Date.now()
  if (q.sec === 'data' || q.sec === 'count') {
    // 이름은 인용(개행·따옴표가 있어도 이력 텍스트를 다시 실행할 때 한 식별자), 페이지 구문은 DBMS별 표기
    const nm = `${qid(q.schema)}.${qid(q.rel)}`
    const pg = `${(q.page - 1) * q.size}`
    const txt = q.sec === 'count' ? `SELECT count(*) FROM ${nm}` : d === 'PG' ? `SELECT * FROM ${nm} LIMIT ${q.size} OFFSET ${pg}` : `SELECT * FROM ${nm} OFFSET ${pg} ROWS FETCH NEXT ${q.size} ROWS ONLY`
    const h = await db().from('mdl_sql_exec_hist').insert({ area_id: areaId, conn_id: connId, usr_id: uid, sql_txt: `-- 객체 편집기 ${q.sec === 'data' ? '데이터' : '건수'}\n${txt}`.slice(0, 4000), stmt_cnt: 1, exec_mode_cd: 'READ', rslt_cd: 'ERR', err_cd: 'RUN', regr_id: uid, modr_id: uid }).select('sql_exec_id').single()
    if (h.error) return dbError(h.error)
    hid = (h.data as { sql_exec_id: string }).sql_exec_id
  }
  const done = async (rslt: 'OK' | 'ERR', rows: number, err?: { cd: string; msg: string }) => {
    if (!hid) return
    const u = await db().from('mdl_sql_exec_hist').update({ rslt_cd: rslt, row_cnt: rows, elapsed_ms: Date.now() - t0, err_cd: err?.cd ?? null, err_msg: err?.msg.slice(0, 200) ?? null, modr_id: uid }).eq('sql_exec_id', hid)
    if (u.error) console.error('[sql-obj-hist]', u.error.code, u.error.message) // 선기록은 남아 있음(err_cd RUN)
  }
  let out: Out
  try {
    if (d === 'PG') {
      const sql = pgClient(t, pwd)
      try {
        out = await sql.begin('read only', async (tx) => {
          await tx.unsafe(`SET LOCAL statement_timeout = ${STMT_MS}`)
          await tx.unsafe('SET LOCAL search_path = pg_catalog') // pg_dump 처럼 — pg_get_*def·format_type 이 스키마를 붙여 DDL 이 search_path 와 무관하게 실행 가능
          return pgObj(tx, q)
        })
      } finally {
        await sql.end({ timeout: 2 }).catch(() => {})
      }
    } else out = await oraObj(t, pwd, q)
  } catch (e) {
    const x = e as { message?: string }
    const message = maskErr(x.message, hide)
    await done('ERR', 0, { cd: 'DB_CONN_FAIL', msg: message })
    return NextResponse.json({ ok: false, code: 'DB_CONN_FAIL', message }, { status: 400 })
  }
  if (typeof out === 'string') {
    await done('ERR', 0, { cd: out, msg: out })
    return apiError(out, out === 'NOT_FOUND' ? 404 : 400)
  }
  await done('OK', 'rows' in out && Array.isArray(out.rows) ? out.rows.length : 'count' in out ? 1 : 0)
  return NextResponse.json({ ok: true, ...out })
}
