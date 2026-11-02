// 사이트 연결 이름 붙인 조회(src/lib/link/queries.ts) 계약 — 조회 이름 18개 불변(17개 + area_plan 2026-11-02), 느린 쿼리 출처용 칼럼(usr_nm·query_id) 포함 · 실행 : pnpm test
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

test('QUERY_NAMES 18개 불변(이름·순서)', () => {
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
    'area_plan',
  ])
})

// 두 앱 계약(2026-11-02 dbms.pi 요금제) — 응답 칼럼·FREE 행, 대상 DB 로 보내지 않음
test('area_plan — { plan_cd, prd_cd, end_dtm, grnt_rsn_cd } 1행, runNamed 대상 DB 경로 차단', () => {
  assert.match(src, /cols: \['plan_cd', 'prd_cd', 'end_dtm', 'grnt_rsn_cd'\]/)
  assert.match(src, /rows: \[\[p\.plan, p\.prd, p\.end, p\.rsn\]\]/)
  assert.ok(src.indexOf("if (q === 'area_plan') return { fail") < src.indexOf('await getConn('))
  const route = readFileSync(new URL('../src/app/api/link/v1/query/route.ts', import.meta.url), 'utf8')
  // 요금제 만료 검사보다 area_plan 분기가 먼저(만료여도 dbms.pi 가 요금제를 읽음)
  assert.ok(route.indexOf("q === 'area_plan'") < route.indexOf('planExpired(a)'))
  assert.match(route, /\{ anyPlan: true \}/)
})

test('top_sql — usr_nm(pg_get_userbyid) 추가, 기존 칼럼 유지', () => {
  const q = sqlOf('top_sql')
  assert.match(q, /pg_get_userbyid\(s\.userid\) AS usr_nm/)
  // 느린 SQL 순위 = 1회 최고 시간(마스터 2026-11-02) — 총 시간·평균 순 금지
  assert.match(q, /ORDER BY s\.max_exec_time DESC/)
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

test('top_sql — 정규식은 바깥 상위 N행에만(안쪽 = 수치 정렬·LIMIT), 연결 API application_name', () => {
  const q = sqlOf('top_sql')
  const inner = q.slice(q.indexOf('FROM (SELECT'))
  assert.ok(q.indexOf('regexp_replace') < q.indexOf('FROM (SELECT'))
  assert.ok(!inner.includes('regexp_replace'), '안쪽 서브쿼리에 정규식 금지')
  assert.ok(!inner.includes('pg_get_userbyid'))
  assert.match(inner, /FROM pg_stat_statements p .*ORDER BY p\.max_exec_time DESC LIMIT \$1\) s/s)
  assert.match(q, /regexp_replace\(left\(s\.query, 2000\), '\\\\s\+'/) // TS 템플릿 안 '\\s+' = DB 로 '\s+'
  assert.match(src, /export const LINK_APP = 'dbms\.pi-link'/)
  assert.match(src, /pgClient\(t, pwd, LINK_APP\)/)
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
