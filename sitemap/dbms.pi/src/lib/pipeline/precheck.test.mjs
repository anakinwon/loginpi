// PiCDC 사전 점검·파이프라인 정의 검사 — 실행 : node --test src/lib/pipeline/precheck.test.mjs (sitemap/dbms.pi 에서, Node 22.18+ 타입 제거)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify, readiness, recommend, summarize } from './precheck.ts'
import { checkSteps, isCron } from './def.ts'

const tables = {
  cols: ['schemaname', 'relname', 'relkind', 'est_rows', 'cmnt'],
  rows: [
    ['public', 'cust', 'r', 100, null],
    ['public', 'ord', 'r', -1, null],
    ['public', 'log', 'r', 5, null],
    ['public', 'nokey', 'r', 1, null],
    ['public', 'v_cust', 'v', 0, null],
  ],
}
const columns = {
  cols: ['schemaname', 'relname', 'attnum', 'attname', 'data_tp', 'attnotnull', 'dflt', 'cmnt'],
  rows: [
    ['public', 'cust', 1, 'cust_id', 'uuid', true, null, null],
    ['public', 'cust', 2, 'mod_dtm', 'timestamp with time zone', true, null, null],
    ['public', 'cust', 3, 'del_yn', 'character(1)', true, null, null],
    ['public', 'ord', 1, 'ord_id', 'bigint', true, null, null],
    ['public', 'ord', 2, 'updated_at', 'timestamp without time zone', false, null, null],
    ['public', 'log', 1, 'log_id', 'bigint', true, null, null],
    ['public', 'log', 2, 'mod_dtm', 'text', false, null, null], // 시간 타입 아님 → 변경시각 아님
    ['public', 'nokey', 1, 'x', 'text', false, null, null],
  ],
}
const indexes = {
  cols: ['schemaname', 'relname', 'indexrelname', 'indisunique', 'indisprimary', 'indisvalid', 'idx_def', 'idx_sz'],
  rows: [
    ['public', 'cust', 'pk_cust', true, true, true, '', 8192],
    ['public', 'ord', 'pk_ord', true, 't', true, '', 8192],
    ['public', 'log', 'pk_log', true, true, true, '', 8192],
  ],
}

test('POLL·KEY_DIFF·NONE 판정 + 뷰 제외', () => {
  const r = classify(tables, columns, indexes, { logicalReady: false })
  assert.equal(r.length, 4)
  const by = Object.fromEntries(r.map((x) => [x.table, x]))
  assert.equal(by.cust.adapter, 'POLL')
  assert.ok(!by.cust.reasons.includes('DELETE_UNSEEN'))
  assert.equal(by.ord.adapter, 'POLL')
  assert.ok(by.ord.reasons.includes('DELETE_UNSEEN'))
  assert.equal(by.ord.estRows, null)
  assert.equal(by.log.adapter, 'KEY_DIFF')
  assert.equal(by.log.chgCol, null)
  assert.equal(by.nokey.adapter, 'NONE')
  assert.ok(by.nokey.reasons.includes('FULL_RELOAD_ONLY'))
  const s = summarize(r)
  assert.deepEqual(s.by, { LOGICAL: 0, POLL: 2, KEY_DIFF: 1, NONE: 1 })
  assert.equal(s.noPk, 1)
  assert.equal(s.deleteUnseen, 1)
})

test('WAL logical 준비면 PK 테이블은 LOGICAL 우선', () => {
  const r = classify(tables, columns, indexes, { logicalReady: true })
  const by = Object.fromEntries(r.map((x) => [x.table, x]))
  assert.equal(by.cust.adapter, 'LOGICAL')
  assert.deepEqual(by.cust.alts, ['LOGICAL', 'POLL', 'KEY_DIFF'])
  assert.equal(by.nokey.adapter, 'NONE')
  assert.equal(recommend(null, null, true, true).adapter, 'LOGICAL')
})

test('readiness — 설정·복제', () => {
  const settings = { cols: ['name', 'setting'], rows: [['wal_level', 'logical'], ['max_replication_slots', '10'], ['max_wal_senders', '10']] }
  const ok = readiness(settings, { cols: ['pid', 'in_recovery'], rows: [] })
  assert.equal(ok.logicalReady, true)
  assert.equal(ok.senders, 0)
  const rep = readiness({ cols: ['name', 'setting'], rows: [['wal_level', 'replica'], ['max_replication_slots', '0']] }, null)
  assert.equal(rep.logicalReady, false)
  assert.ok(rep.reasons.includes('WAL_NOT_LOGICAL') && rep.reasons.includes('NO_SLOTS'))
  assert.equal(rep.senders, null)
  const sb = readiness(settings, { cols: ['pid', 'in_recovery'], rows: [[1, true]] })
  assert.equal(sb.logicalReady, false)
  assert.ok(sb.reasons.includes('IS_STANDBY'))
  assert.ok(readiness(null, null).reasons.includes('SETTINGS_UNKNOWN'))
})

test('cron·단계 검사', () => {
  assert.ok(isCron('*/5 * * * *'))
  assert.ok(isCron('0 2 * * 1-5'))
  assert.ok(!isCron('* * * *'))
  assert.ok(!isCron('0 2 * * MON; rm'))
  const S = (kind) => ({ kind, op: 'x', note: '' })
  assert.equal(checkSteps([S('SOURCE'), S('TRANSFORM'), S('TARGET')]), null)
  assert.equal(checkSteps([S('SOURCE')]), 'STEPS_TOO_FEW')
  assert.equal(checkSteps([S('TRANSFORM'), S('TARGET')]), 'STEP_FIRST_SOURCE')
  assert.equal(checkSteps([S('SOURCE'), S('TRANSFORM')]), 'STEP_LAST_TARGET')
  assert.equal(checkSteps([S('SOURCE'), S('SOURCE'), S('TARGET')]), 'STEP_MIDDLE_TRANSFORM')
})
