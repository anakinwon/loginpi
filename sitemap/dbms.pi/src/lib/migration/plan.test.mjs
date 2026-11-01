// PiMig 이행 계획 검사 — 실행 : node --test src/lib/migration/plan.test.mjs (sitemap/dbms.pi 에서, Node 22.18+ 타입 제거)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPlan, clampOpts, toSnapshot, verifySql, verifyScript } from './plan.ts'

const model = {
  entities: [
    { entId: 'e1', tblNm: 'CUST' },
    { entId: 'e2', tblNm: 'ORD' },
    { entId: 'e3', tblNm: 'ORD_ITEM' },
    { entId: 'e4', tblNm: 'A' },
    { entId: 'e5', tblNm: 'B' },
    { entId: 'e6', tblNm: 'DEPT' },
    { entId: 'e7', tblNm: null },
  ],
  relations: [
    { parentEntId: 'e1', childEntId: 'e2' },
    { parentEntId: 'e2', childEntId: 'e3' },
    { parentEntId: 'e1', childEntId: 'e3' },
    { parentEntId: 'e4', childEntId: 'e5' },
    { parentEntId: 'e5', childEntId: 'e4' },
    { parentEntId: 'e5', childEntId: 'e3' },
    { parentEntId: 'e6', childEntId: 'e6' },
    { parentEntId: 'e7', childEntId: 'e1' },
  ],
  tables: ['CUST', 'ORD', 'ORD_ITEM', 'A', 'B', 'DEPT'].map((n, i) => ({ tblId: `t${i}`, tblNm: n })),
  columns: [
    { tblId: 't1', colNm: 'ORD_AMT', phyTpNm: 'NUMERIC(12,2)', pkYn: 'N', colSeq: 2 },
    { tblId: 't1', colNm: 'ORD_ID', phyTpNm: 'BIGINT', pkYn: 'Y', colSeq: 1 },
    { tblId: 't1', colNm: 'ORD_NM', phyTpNm: 'VARCHAR', pkYn: 'N', colSeq: 3 },
    { tblId: 't0', colNm: 'CUST NM', phyTpNm: 'VARCHAR', pkYn: 'N', colSeq: 1 },
  ],
}

test('스냅샷 — 물리 테이블 없는 관계 제외·칼럼 순서', () => {
  const s = toSnapshot(model)
  assert.equal(s.tables.length, 6)
  assert.equal(s.dropped, 1)
  assert.deepEqual(s.tables.find((t) => t.nm === 'ORD').cols.map((c) => c.nm), ['ORD_ID', 'ORD_AMT', 'ORD_NM'])
})

test('위상 정렬 — 부모 먼저, 순환 묶음 보고, 자기 참조 분리', () => {
  const p = buildPlan(toSnapshot(model), { chunkSize: 1000, parallel: 2 })
  const pos = (n) => p.order.indexOf(n)
  assert.ok(pos('CUST') < pos('ORD') && pos('ORD') < pos('ORD_ITEM'))
  assert.ok(pos('A') < pos('ORD_ITEM') && pos('B') < pos('ORD_ITEM'))
  assert.deepEqual(p.cycles, [['A', 'B']])
  assert.deepEqual(p.selfRefs, ['DEPT'])
  assert.equal(p.order.length, 6)
  // 단계 0 = A·B·CUST·DEPT → 병렬도 2 로 묶음 2개
  assert.deepEqual(p.levels[0].batches, [['A', 'B'], ['CUST', 'DEPT']])
  assert.deepEqual(p.levels.map((l) => l.level), [0, 1, 2])
})

test('긴 사슬도 스택 넘침 없음', () => {
  const n = 20000
  const snap = {
    tables: Array.from({ length: n }, (_, i) => ({ nm: `T${i}`, cols: [] })),
    rels: Array.from({ length: n - 1 }, (_, i) => ({ p: `T${i}`, c: `T${i + 1}` })),
    dropped: 0,
  }
  const p = buildPlan(snap, { chunkSize: 1000, parallel: 4 })
  assert.equal(p.levels.length, n)
  assert.equal(p.order[0], 'T0')
})

test('옵션 범위 보정', () => {
  assert.deepEqual(clampOpts({ chunkSize: 5, parallel: 999 }), { chunkSize: 100, parallel: 64 })
  assert.deepEqual(clampOpts({}), { chunkSize: 10000, parallel: 4 })
})

test('검증 SQL — 건수·합계·키 중복·해시(PG 만)·이름 인용', () => {
  const s = toSnapshot(model)
  const ord = s.tables.find((t) => t.nm === 'ORD')
  const pg = verifySql(ord, 'PG')
  assert.equal(pg.count, 'SELECT COUNT(*) AS cnt FROM ORD;')
  assert.equal(pg.sum, 'SELECT COUNT(*) AS cnt, SUM(ORD_AMT) AS s1 FROM ORD;')
  assert.match(pg.dupKey, /GROUP BY ORD_ID HAVING COUNT\(\*\) > 1/)
  assert.match(pg.hash, /md5\(string_agg/)
  assert.equal(verifySql(ord, 'ORACLE').hash, null)
  const cust = verifySql(s.tables.find((t) => t.nm === 'CUST'), 'PG')
  assert.equal(cust.sum, null)
  assert.equal(cust.dupKey, null)
  assert.equal(verifySql({ nm: 'x"y', cols: [] }, 'PG').count, 'SELECT COUNT(*) AS cnt FROM "x""y";')
  assert.match(verifyScript(s, ['CUST', 'ORD'], 'PG'), /^-- CUST\nSELECT COUNT/)
})
