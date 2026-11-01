// plan.ts 순수 로직 시험 — node --test src/lib/sql-lab/plan.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePlan, analyzePlan, diffPlans, maskLiterals, maskPlan, isSingleSelect, normalizeSql } from './plan.ts'

const raw = JSON.stringify([{ Plan: {
  'Node Type': 'Sort', 'Total Cost': 900, 'Plan Rows': 50000, 'Plan Width': 200,
  Plans: [{ 'Node Type': 'Nested Loop', 'Plan Rows': 50000, 'Total Cost': 800, Plans: [
    { 'Node Type': 'Seq Scan', 'Relation Name': 'orders', 'Plan Rows': 20000, Filter: "(name = 'bob'::text) AND (amt > 100)" },
    { 'Node Type': 'Index Scan', 'Relation Name': 'users', 'Plan Rows': 1 },
  ] }],
} }])

test('parsePlan 은 문자열·배열·Plan 래퍼를 받는다', () => {
  assert.equal(parsePlan(raw)['Node Type'], 'Sort')
  assert.equal(parsePlan(JSON.parse(raw))['Node Type'], 'Sort')
  assert.equal(parsePlan('not json'), null)
  assert.equal(parsePlan([{}]), null)
})

test('analyzePlan 경고 3종', () => {
  const codes = analyzePlan(parsePlan(raw)).map((w) => `${w.code}@${w.path}`)
  assert.deepEqual(codes.sort(), ['NESTED_LOOP_HIGH@0.0', 'SEQ_SCAN_LARGE@0.0.0', 'SORT_SPILL@0'])
})

test('diffPlans 비용·접근 방식 변화', () => {
  const a = parsePlan(raw)
  const b = { 'Node Type': 'Hash Join', 'Total Cost': 450, Plans: [
    { 'Node Type': 'Index Scan', 'Relation Name': 'orders' },
    { 'Node Type': 'Index Scan', 'Relation Name': 'users' },
  ] }
  const d = diffPlans(a, b)
  assert.equal(d.delta, -450)
  assert.equal(d.pct, -50)
  assert.deepEqual(d.scanChanges, [{ relation: 'orders', a: 'Seq Scan', b: 'Index Scan' }])
  assert.ok(d.typeChanges.some((c) => c.nodeType === 'Sort' && c.a === 1 && c.b === 0))
})

test('maskLiterals·maskPlan 은 상수만 가린다', () => {
  assert.equal(maskLiterals("where nm = 'O''Neil' and t2024.amt > 10.5"), "where nm = '?' and t2024.amt > ?")
  const m = maskPlan(parsePlan(raw))
  assert.equal(m.Plans[0].Plans[0].Filter, "(name = '?'::text) AND (amt > ?)")
  assert.equal(m.Plans[0].Plans[0]['Relation Name'], 'orders')
})

test('isSingleSelect·normalizeSql', () => {
  assert.ok(isSingleSelect('select 1;'))
  assert.ok(isSingleSelect("with x as (select ';' a) select * from x"))
  assert.ok(!isSingleSelect('select 1; drop table t'))
  assert.ok(!isSingleSelect('delete from t'))
  assert.equal(normalizeSql("SELECT  *\n FROM t WHERE a = 5;"), 'select * from t where a = ?')
})
