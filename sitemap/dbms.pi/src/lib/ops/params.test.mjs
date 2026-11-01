// DB 운영 안전 순수 규칙 시험 — 실행 : node --test src/lib/ops/params.test.mjs (Node 22.18+ 타입 제거로 .ts 직접 import)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditRoles, backupChecks, diagnoseParams, intervalSec, replicationStatus, toBytes } from './params.ts'

const s = (name, setting, unit = null) => ({ name, setting, unit })
const rule = (fs, name) => fs.find((f) => f.name === name)

test('단위 변환 : 8kB 페이지·kB', () => {
  assert.equal(toBytes(s('shared_buffers', '16384', '8kB')), 128 * 1024 * 1024)
  assert.equal(toBytes(s('x', 'on')), null)
})

test('파라미터 : 기본값 경고·autovacuum off 위험·wal minimal 위험', () => {
  const f = diagnoseParams([
    s('shared_buffers', '16384', '8kB'),
    s('work_mem', '4096', 'kB'),
    s('max_connections', '100'),
    s('autovacuum', 'off'),
    s('wal_level', 'minimal'),
    s('log_min_duration_statement', '-1', 'ms'),
    s('random_page_cost', '4'),
    s('checkpoint_timeout', '900', 's'),
  ])
  assert.equal(rule(f, 'shared_buffers').level, 'WARN')
  assert.equal(rule(f, 'shared_buffers').value, '128MB')
  assert.equal(rule(f, 'work_mem').rule, 'wm_default')
  assert.equal(rule(f, 'autovacuum').level, 'RISK')
  assert.equal(rule(f, 'wal_level').level, 'RISK')
  assert.equal(rule(f, 'log_min_duration_statement').rule, 'lmd_off')
  assert.equal(rule(f, 'random_page_cost').level, 'WARN')
  assert.equal(rule(f, 'checkpoint_timeout').level, 'OK')
  assert.equal(rule(f, 'max_connections').level, 'OK')
})

test('파라미터 : work_mem × 접속 수 > 추정 메모리 = 위험, 없는 설정은 건너뜀', () => {
  const f = diagnoseParams([s('shared_buffers', '131072', '8kB'), s('work_mem', '65536', 'kB'), s('max_connections', '300')])
  assert.equal(rule(f, 'work_mem').level, 'RISK')
  assert.equal(rule(f, 'max_connections').level, 'WARN')
  assert.equal(rule(f, 'autovacuum'), undefined)
})

test('권한 감사 : superuser 2명·PUBLIC 쓰기 권한·만료 없음', () => {
  const r = (n, sup, login, until = null, bypass = false) => ({ rolname: n, rolsuper: sup, rolcanlogin: login, rolbypassrls: bypass, rolvaliduntil: until })
  const f = auditRoles(
    [r('postgres', true, true), r('admin2', true, true, '2027-01-01'), r('app', false, true, null, true), r('grp', false, false)],
    [
      { grantee: 'PUBLIC', table_schema: 'public', table_name: 't', privilege_type: 'SELECT' },
      { grantee: 'PUBLIC', table_schema: 'public', table_name: 't', privilege_type: 'INSERT' },
      { grantee: 'app', table_schema: 'public', table_name: 't', privilege_type: 'SELECT' },
    ],
  )
  const by = Object.fromEntries(f.map((x) => [x.rule, x]))
  assert.equal(by.super_many.level, 'RISK')
  assert.deepEqual(by.bypass_rls.targets, ['app'])
  assert.deepEqual(by.no_expiry.targets, ['postgres', 'app'])
  assert.equal(by.public_grant.level, 'RISK')
  assert.deepEqual(by.public_grant.targets, ['public.t(SELECT,INSERT)'])
})

test('백업 : archive off 위험, 켜짐 + 실패 진행 중 위험, 24시간 지남 경고', () => {
  assert.equal(backupChecks(null, [s('archive_mode', 'off'), s('wal_level', 'replica')])[0].level, 'RISK')
  const now = Date.parse('2026-11-01T12:00:00Z')
  const f = backupChecks(
    { archived_count: 5, last_archived_time: '2026-10-30T00:00:00Z', failed_count: 2, last_failed_time: '2026-11-01T11:00:00Z', archive_mode: 'on' },
    [s('wal_level', 'replica'), s('archive_command', 'cp %p /a/%f')],
    now,
  )
  const rules = f.map((x) => x.rule)
  assert.ok(rules.includes('arc_stale'))
  assert.ok(rules.includes('arc_failing'))
  assert.ok(!rules.includes('arc_cmd_empty'))
})

test('복제 : interval 파싱·지연 판정·Standby 없음 위험', () => {
  assert.equal(intervalSec('00:00:01.5'), 1.5)
  assert.equal(intervalSec('1 day 00:00:10'), 86410)
  assert.equal(intervalSec(null), null)
  assert.equal(replicationStatus([], false).summary.rule, 'repl_none')
  assert.equal(replicationStatus([], true).role, 'standby')
  const r = replicationStatus(
    [
      { application_name: 's1', client_addr: null, state: 'streaming', sync_state: 'async', replay_lag: '00:02:00' },
      { application_name: 's2', client_addr: null, state: 'streaming', sync_state: 'async', replay_lag: null },
    ],
    false,
  )
  assert.deepEqual(r.replicas.map((x) => x.level), ['RISK', 'OK'])
  assert.equal(r.summary.level, 'RISK')
})
