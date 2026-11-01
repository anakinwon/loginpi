// 사이트 연결 이름 붙인 조회(src/lib/link/queries.ts) 계약 — 조회 이름 17개 불변, 느린 쿼리 출처용 칼럼(usr_nm·query_id) 포함 · 실행 : pnpm test
// queries.ts 는 'server-only' 를 import 해서 node 에서 직접 못 불러오므로 원문 텍스트로 단언한다
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(
  new URL('../src/lib/link/queries.ts', import.meta.url),
  'utf8',
)
const body = src.slice(src.indexOf('const Q = {'), src.indexOf('} as const'))
const names = [...body.matchAll(/^ {2}([a-z_]+): [`']/gm)].map((m) => m[1])
const sqlOf = (n: string) =>
  body.slice(
    body.indexOf(`  ${n}: \``),
    body.indexOf('`,', body.indexOf(`  ${n}: \``)),
  )

test('QUERY_NAMES 17개 불변(이름·순서)', () => {
  assert.deepEqual(names, [
    'db_stats',
    'top_sql',
    'tbl_stats',
    'idx_stats',
    'sizes',
    'activity',
    'locks',
    'settings',
    'roles',
    'table_privs',
    'catalog_tables',
    'catalog_columns',
    'catalog_indexes',
    'replication',
    'archiver',
    'version',
    'explain',
  ])
})

test('top_sql — usr_nm(pg_get_userbyid) 추가, 기존 칼럼 유지', () => {
  const q = sqlOf('top_sql')
  assert.match(q, /pg_get_userbyid\(s\.userid\) AS usr_nm/)
  for (const c of [
    'AS queryid',
    'AS query,',
    's.calls',
    'AS total_ms',
    'AS mean_ms',
    'AS max_ms',
    's.rows',
    's.temp_blks_written',
  ])
    assert.ok(q.includes(c), c)
})

test('activity — query_id(to_jsonb, PG13 이하 NULL) 추가, 기존 칼럼 유지', () => {
  const q = sqlOf('activity')
  assert.match(q, /\(to_jsonb\(a\) ->> 'query_id'\) AS query_id/)
  assert.match(q, /current_user AS link_usr/) // 권한 안내 GRANT 대상 계정
  assert.match(q, /FROM pg_stat_activity a /)
  for (const c of [
    'a.pid',
    'a.usename',
    'a.application_name',
    'AS client_addr',
    'a.backend_type',
    'a.state',
    'a.wait_event_type',
    'a.wait_event',
    'a.xact_start',
    'a.query_start',
    'AS run_ms',
    'AS query,',
  ])
    assert.ok(q.includes(c), c)
})
