// tune.ts 순수 로직 시험 — node --test src/lib/sql-lab/tune.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aftPlanError,
  effectPct,
  filterColumn,
  nextStatus,
  parseAiItems,
  ruleRecommend,
} from './tune.ts'

const plan = {
  'Node Type': 'Sort',
  'Total Cost': 900,
  'Plan Rows': 50000,
  'Plan Width': 200,
  Plans: [
    {
      'Node Type': 'Seq Scan',
      'Relation Name': 'orders',
      'Plan Rows': 20000,
      Filter: "((status)::text = '?'::text)",
    },
  ],
}

test('filterColumn — 캐스트·괄호 조건식에서 칼럼', () => {
  assert.equal(filterColumn("((status)::text = '?'::text)"), 'status')
  assert.equal(filterColumn('(amt > ?)'), 'amt')
  assert.equal(filterColumn(undefined), null)
})

test('ruleRecommend — 큰 전체 스캔 → 인덱스, 정렬 넘침 → 설정, SELECT * → 재작성', () => {
  const items = ruleRecommend('SELECT * FROM orders WHERE status = ?', plan)
  const codes = items.map((i) => i.code)
  assert.ok(codes.includes('SEQ_SCAN_INDEX'))
  assert.ok(codes.includes('SORT_SPILL'))
  assert.ok(codes.includes('SELECT_STAR'))
  const idx = items.find((i) => i.code === 'SEQ_SCAN_INDEX')
  assert.equal(idx.ddl, 'CREATE INDEX x_orders_NN ON orders (status);')
})

test('parseAiItems — 형식 틀린 항목·위험 DDL 제거', () => {
  const out = parseAiItems({
    items: [
      {
        kind: 'INDEX',
        title: 't',
        reason: 'r',
        ddl: 'CREATE INDEX x ON a (b);',
      },
      { kind: 'INDEX', title: 't2', reason: 'r2', ddl: 'DROP TABLE a;' },
      { kind: 'NOPE', title: 't', reason: 'r' },
      { kind: 'STATS', title: '', reason: 'r' },
    ],
  })
  assert.equal(out.length, 2)
  assert.equal(out[0].ddl, 'CREATE INDEX x ON a (b);')
  assert.equal(out[1].ddl, undefined)
  assert.deepEqual(parseAiItems(null), [])
})

test('parseAiItems — 다중 문장 DDL 거부(끝 ; 하나만 허용)', () => {
  const ddl = (d) =>
    parseAiItems({
      items: [{ kind: 'INDEX', title: 't', reason: 'r', ddl: d }],
    })[0].ddl
  assert.equal(ddl('CREATE INDEX a ON t(c); DROP TABLE t;'), undefined)
  assert.equal(ddl('CREATE INDEX a ON t(c)\nDROP TABLE t'), undefined)
  assert.equal(ddl('ANALYZE t;; '), undefined)
  assert.equal(ddl('ANALYZE t'), 'ANALYZE t')
  assert.equal(
    ddl('CREATE UNIQUE INDEX a ON t (c);'),
    'CREATE UNIQUE INDEX a ON t (c);',
  )
})

test('ruleRecommend — 마스킹된 LIKE 는 앞 % 권고 없음', () => {
  const items = ruleRecommend("SELECT a FROM t WHERE nm LIKE '?'", {
    'Node Type': 'Result',
  })
  assert.ok(!items.some((i) => i.code === 'LEADING_WILDCARD'))
})

test('nextStatus — 측정은 승인 뒤에만', () => {
  assert.equal(nextStatus('RCMD', 'approve'), 'APRV')
  assert.equal(nextStatus('RCMD', 'measure'), null)
  assert.equal(nextStatus('APRV', 'measure'), 'APLD')
  assert.equal(nextStatus('RJCT', 'approve'), null)
})

test('effectPct', () => {
  assert.equal(effectPct(200, 50), -75)
  assert.equal(effectPct(0, 5), null)
})

test('aftPlanError — 다른 접속·다른 SQL·전 계획·승인 이전 거부', () => {
  const tun = {
    plan_id: 'p1',
    conn_id: 'c1',
    sql_hash: 'h',
    aprv_dtm: '2026-11-01T00:00:00.000Z',
  }
  const aft = {
    plan_id: 'p2',
    conn_id: 'c1',
    sql_hash: 'h',
    reg_dtm: '2026-11-01 00:00:01.123456+00:00',
  }
  assert.equal(aftPlanError(tun, aft), null)
  assert.equal(
    aftPlanError(tun, { ...aft, conn_id: 'c2' }),
    'TUN_PLAN_MISMATCH',
  )
  assert.equal(
    aftPlanError(tun, { ...aft, sql_hash: 'x' }),
    'TUN_PLAN_MISMATCH',
  )
  assert.equal(
    aftPlanError(tun, { ...aft, plan_id: 'p1' }),
    'TUN_PLAN_MISMATCH',
  )
  assert.equal(
    aftPlanError(tun, { ...aft, reg_dtm: '2026-10-31T23:59:59Z' }),
    'TUN_PLAN_STALE',
  )
})
