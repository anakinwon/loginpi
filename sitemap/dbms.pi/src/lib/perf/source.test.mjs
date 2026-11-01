// 느린 쿼리 출처 판정 시험 — 실행 : node --test src/lib/perf/source.test.mjs (Node 22.18+ 타입 제거로 .ts 직접 import)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifySrc, judgeSrc, maskAddr, qidCause } from './source.ts'

const cb = 'client backend'
const c = (appNm, usrNm = 'u1', bkndTp = cb) =>
  classifySrc({ appNm, usrNm, bkndTp }).cd

test('분류 : 규칙 9종 판정 순서', () => {
  assert.equal(c('', 'u1', 'autovacuum worker'), 'PLATFORM') // 1
  assert.equal(c('schema.pi'), 'MONITOR') // 2
  assert.equal(c('pg_cron scheduler'), 'BATCH') // 3 앱
  assert.equal(c('', 'batch_usr'), 'BATCH') // 3 계정만
  assert.equal(c('DBeaver 24.1.0 - SQLEditor'), 'TOOL') // 4
  assert.equal(c('postgrest'), 'PROGRAM') // 5 PostgREST = 앱 API
  assert.equal(c('', 'supabase_admin'), 'PLATFORM') // 5 관리형 계정
  assert.equal(c('PostgreSQL JDBC Driver'), 'PROGRAM') // 6
  assert.equal(c('', 'order_svc'), 'PROGRAM') // 7
  assert.equal(c('', 'hong.gildong'), 'TOOL') // 8
  assert.equal(c('', 'x'), 'UNKNOWN') // 9
})

test('분류 : 배치 계정이라도 앱이 DBeaver 면 사람 도구', () => {
  assert.equal(c('DBeaver', 'batch_usr'), 'TOOL')
  assert.equal(c('DBeaver 24.1.0 - Main <batch_prod>'), 'TOOL')
  assert.equal(c('DBeaver 24.1.0 - SQLEditor <jobs>'), 'TOOL')
  assert.equal(c('pgAdmin 4 - DB:worker_db'), 'TOOL')
  assert.equal(c('pg_cron scheduler'), 'BATCH')
})

const s = (appNm, smpCnt, usrNm = 'u1', actvCnt = smpCnt) => ({
  appNm,
  usrNm,
  bkndTp: cb,
  addr: '10.0.0.0/24',
  smpCnt,
  actvCnt,
})

test('확신도 : 높음(비율 ≥ 0.8·표본 ≥ 3) / 보통 / 낮음', () => {
  assert.deepEqual(
    (({ cd, conf, smpCnt }) => ({ cd, conf, smpCnt }))(
      judgeSrc([s('DBeaver', 8), s('JDBC', 2)]),
    ),
    { cd: 'TOOL', conf: 'high', smpCnt: 10 },
  )
  assert.equal(judgeSrc([s('DBeaver', 2)]).conf, 'mid') // 표본 3 미만
  assert.equal(judgeSrc([s('DBeaver', 6), s('JDBC', 4)]).conf, 'mid') // 0.6
  assert.equal(judgeSrc([s('JDBC', 10)]).conf, 'mid') // 보통 규칙 단독 0.7
  assert.equal(judgeSrc([s('', 10, 'order_svc')], 'order_svc').conf, 'low') // 계정만 규칙 0.4
})

test('확신도 : 계정(확정) 표본만 · 표본 0 = 계정만 · PG14 미만 = 버전 한계', () => {
  const j = judgeSrc(
    [s('DBeaver', 9, 'hong.gd'), s('JDBC', 1, 'app_svc')],
    'app_svc',
  )
  assert.equal(j.cd, 'PROGRAM')
  assert.equal(j.smpCnt, 1)
  const a = judgeSrc([], 'batch_usr', 160000)
  assert.deepEqual([a.cd, a.conf, a.smpCnt], ['BATCH', 'acct', 0])
  assert.equal(judgeSrc([], 'u1', 130000).conf, 'ver')
  assert.equal(judgeSrc([s('JDBC', 1, 'other')], 'u1').conf, 'acct') // 다른 계정 표본은 버림
})

test('주소 마스킹 : IPv4 /24 · IPv6 /48 · 없음 = local · 이상값 = 빈 값', () => {
  assert.equal(maskAddr('203.0.113.77'), '203.0.113.0/24')
  assert.equal(maskAddr('203.0.113.77/32'), '203.0.113.0/24')
  assert.equal(maskAddr('::ffff:10.1.2.3'), '10.1.2.0/24')
  assert.equal(maskAddr('2001:db8:abcd:12::1'), '2001:db8:abcd::/48')
  assert.equal(maskAddr('2001:0db8::1'), '2001:db8:0::/48')
  assert.equal(maskAddr(null), 'local')
  assert.equal(maskAddr('999.1.1.1'), '')
  assert.equal(maskAddr('not-an-ip'), '')
})

test('query_id 미수집 원인 : 수집됨·버전·권한 부족·설정 꺼짐 구분', () => {
  const r = (queryId, query) => ({ backendType: cb, queryId, query })
  assert.equal(qidCause([r('123', 'select 1'), r(null, null)], 160000), 'ok')
  assert.equal(qidCause([r(null, 'select 1')], 130000), 'ver')
  assert.equal(
    qidCause(
      [r(null, '<insufficient privilege>'), r(null, 'select 1')],
      160000,
    ),
    'priv',
  )
  assert.equal(qidCause([r(null, 'select 1')], 160000), 'off')
  assert.equal(
    qidCause(
      [{ backendType: 'walsender', queryId: null, query: null }],
      160000,
    ),
    null,
  )
})

test('활성 표본 우선 : 쉬는 도구 세션 표본이 많아도 활성 표본이 있는 배치로 판정', () => {
  // DBeaver 창을 열어 두고 방치 — idle 로 폴링마다 50 누적(활성 0), 배치는 실행 중 4회 관측
  const j = judgeSrc([s('DBeaver', 50, 'u1', 0), s('pg_cron', 4, 'u1', 4)])
  assert.deepEqual(
    [j.cd, j.conf, j.smpCnt, j.actvCnt],
    ['BATCH', 'high', 54, 4],
  )
  assert.equal(j.top[0].appNm, 'pg_cron')
})

test('활성 표본 없음 : 전체 표본으로 판정하되 확신 상한 보통', () => {
  const j = judgeSrc([s('DBeaver', 20, 'u1', 0)])
  assert.deepEqual([j.cd, j.conf, j.actvCnt], ['TOOL', 'mid', 0])
})
