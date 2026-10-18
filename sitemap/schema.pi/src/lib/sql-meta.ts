// SQL 편집기 메타데이터(서버 전용, 2026-10-18) — 탐색기 트리·자동 완성. DBeaver PostgreSchema$TableCache 처럼 스키마당 pg_class 1회 → relkind 분류, 노드 펼칠 때만
// 고정 카탈로그 SQL + 바인드 파라미터만(사용자 입력을 SQL 에 넣지 않음), PostgreSQL 은 READ ONLY 트랜잭션
import 'server-only'
import { STMT_MS, maskErr, pgClient } from './db-exec'
import { cell, openConn, type Cell } from './sql-run'
import { NextResponse } from 'next/server'
import type { MbrRole } from './roles'

export type MetaNode = 'schemas' | 'objects' | 'columns' | 'completion'
const PG: Record<MetaNode, string> = {
  schemas: `SELECT nspname AS name, (nspname = current_schema()) AS cur FROM pg_namespace WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema' ORDER BY nspname`,
  objects: `SELECT c.relname AS name, c.relkind::text AS kind, CASE WHEN c.relkind IN ('r','p','m') THEN pg_total_relation_size(c.oid) END AS size, obj_description(c.oid, 'pg_class') AS cmt
              FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = $1 AND c.relkind IN ('r','p','v','m','S','f') AND NOT c.relispartition
            UNION ALL
            SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', 'F', NULL, NULL
              FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = $1 AND p.prokind IN ('f','p')
            ORDER BY 2, 1 LIMIT 5000`,
  columns: `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS nn,
                   EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = a.attrelid AND i.indisprimary AND a.attnum = ANY (i.indkey)) AS pk,
                   col_description(a.attrelid, a.attnum) AS cmt
              FROM pg_attribute a
             WHERE a.attrelid = (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname = $2)
               AND a.attnum > 0 AND NOT a.attisdropped
             ORDER BY a.attnum`,
  completion: `SELECT c.relname AS t, a.attname AS col
                 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
                WHERE n.nspname = $1 AND c.relkind IN ('r','p','v','m','f') ORDER BY c.relname, a.attnum LIMIT 20000`,
}
const ORA: Record<MetaNode, string> = {
  schemas: `SELECT username AS name, CASE WHEN username = SYS_CONTEXT('USERENV','CURRENT_SCHEMA') THEN 1 ELSE 0 END AS cur FROM all_users WHERE oracle_maintained = 'N' ORDER BY username`,
  objects: `SELECT object_name AS name, DECODE(object_type, 'TABLE','r', 'VIEW','v', 'MATERIALIZED VIEW','m', 'SEQUENCE','S', 'F') AS kind, NULL AS "SIZE", NULL AS cmt
              FROM all_objects WHERE owner = :1 AND object_type IN ('TABLE','VIEW','MATERIALIZED VIEW','SEQUENCE','FUNCTION','PROCEDURE','PACKAGE')
             ORDER BY 2, 1 FETCH FIRST 5000 ROWS ONLY`,
  columns: `SELECT c.column_name AS name, c.data_type || CASE WHEN c.data_type IN ('VARCHAR2','CHAR','NVARCHAR2','RAW') THEN '(' || c.char_length || ')' WHEN c.data_type = 'NUMBER' AND c.data_precision IS NOT NULL THEN '(' || c.data_precision || ',' || c.data_scale || ')' END AS type,
                   CASE c.nullable WHEN 'N' THEN 1 ELSE 0 END AS nn,
                   CASE WHEN EXISTS (SELECT 1 FROM all_constraints k JOIN all_cons_columns kc ON kc.owner = k.owner AND kc.constraint_name = k.constraint_name
                                      WHERE k.owner = c.owner AND k.table_name = c.table_name AND k.constraint_type = 'P' AND kc.column_name = c.column_name) THEN 1 ELSE 0 END AS pk,
                   NULL AS cmt
              FROM all_tab_columns c WHERE c.owner = :1 AND c.table_name = :2 ORDER BY c.column_id`,
  completion: `SELECT table_name AS t, column_name AS col FROM all_tab_columns WHERE owner = :1 ORDER BY table_name, column_id FETCH FIRST 20000 ROWS ONLY`,
}

export async function getMeta(areaId: string, connId: string, role: MbrRole, node: MetaNode, schema: string | null, rel: string | null): Promise<NextResponse> {
  const oc = await openConn(areaId, connId, role)
  if (oc instanceof NextResponse) return oc
  const { d, t, pwd } = oc
  const args = node === 'schemas' ? [] : node === 'columns' ? [schema, rel] : [schema]
  const hide = [t.host, t.ip, t.usr, t.db, pwd]
  let rows: Record<string, Cell>[]
  try {
    if (d === 'PG') {
      const sql = pgClient(t, pwd)
      try {
        rows = await sql.begin('read only', async (tx) => {
          await tx.unsafe(`SET LOCAL statement_timeout = ${STMT_MS}`)
          return (await tx.unsafe(PG[node], args as string[])) as unknown as Record<string, Cell>[]
        })
      } finally {
        await sql.end({ timeout: 2 }).catch(() => {})
      }
    } else {
      const ora = (await import('oracledb')).default
      const cn = await ora.getConnection({ user: t.usr, password: pwd, connectString: `${t.ip}:${t.port}/${t.db}`, connectTimeout: 10 })
      try {
        cn.callTimeout = STMT_MS
        const r = await cn.execute(ORA[node], args, { maxRows: 20000 })
        const names = (r.metaData ?? []).map((m) => m.name.toLowerCase())
        rows = ((r.rows ?? []) as unknown[][]).map((x) => Object.fromEntries(names.map((n, i) => [n, x[i] as Cell])))
      } finally {
        await cn.close().catch(() => {})
      }
    }
  } catch (e) {
    const x = e as { code?: string; message?: string }
    return NextResponse.json({ ok: false, code: 'DB_CONN_FAIL', message: maskErr(x.message, hide) }, { status: 400 })
  }
  const items = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === 'nn' || k === 'pk' || k === 'cur' ? !!v && v !== '0' && v !== 0 : cell(v)])))
  if (node === 'completion') {
    // CodeMirror lang-sql schema 형식 { 테이블: [칼럼…] }
    const map: Record<string, string[]> = {}
    for (const r of items) (map[String(r.t)] ??= []).push(String(r.col))
    return NextResponse.json({ ok: true, tables: map })
  }
  return NextResponse.json({ ok: true, items })
}
