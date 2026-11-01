// 분석·레이크 순수 로직 검사 — 실행 : node --test src/lib/analytics/lake.test.mjs (Node 22.18+ 타입 제거로 .ts 직접 import)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { barPcts, buildLake, dailyCounts, isMissingTable, isStdColName, overallConform } from './lake.ts'

test('표준 칼럼명 형식', () => {
  assert.ok(isStdColName('usr_id'))
  assert.ok(isStdColName('USR_ID'))
  assert.ok(!isStdColName('UsrId'))
  assert.ok(!isStdColName('usr__id'))
  assert.ok(!isStdColName('1col'))
  assert.ok(!isStdColName('a'.repeat(31)))
})

test('레이크 3층 매핑 — 칼럼 순서·엔터티·적합률', () => {
  const tbls = buildLake({
    entities: [{ entId: 'e1', entNm: '사용자', tblNm: 'SYS_USER' }],
    tables: [
      { tblId: 't2', tblNm: 'ord' },
      { tblId: 't1', tblNm: 'SYS_USER' },
      { tblId: 't3', tblNm: '  ' },
    ],
    columns: [
      { tblId: 't1', colNm: 'usr_nm', colSeq: 2 },
      { tblId: 't1', colNm: 'usr_id', colSeq: 1, pkYn: 'Y', phyTpNm: 'uuid' },
      { tblId: 't1', colNm: 'BadName', colSeq: 3 },
      { tblId: 't2', colNm: 'ord_id', colSeq: 1 },
    ],
  })
  assert.equal(tbls.length, 2)
  const u = tbls.find((t) => t.tblNm === 'SYS_USER')
  assert.equal(u.entNm, '사용자')
  assert.deepEqual([u.rawNm, u.stdNm, u.curNm], ['raw_sys_user', 'std_sys_user', 'cur_sys_user'])
  assert.deepEqual(u.cols.map((c) => c.colNm), ['usr_id', 'usr_nm', 'BadName'])
  assert.equal(u.cols[2].stdNm, 'badname')
  assert.ok(u.cols[0].pk)
  assert.equal(u.cnfmPct, 66.7)
  assert.equal(overallConform(tbls), 75)
  assert.deepEqual(buildLake({}), [])
})

test('일별 건수·막대 폭', () => {
  const now = new Date('2026-11-01T12:00:00Z')
  const d = dailyCounts(['2026-11-01T01:00:00Z', '2026-11-01T02:00:00Z', '2026-10-31T23:00:00Z', '2026-10-01T00:00:00Z'], 3, now)
  assert.deepEqual(d, [
    { day: '2026-10-30', cnt: 0 },
    { day: '2026-10-31', cnt: 1 },
    { day: '2026-11-01', cnt: 2 },
  ])
  assert.deepEqual(barPcts([0, 1, 100, null]), [0, 2, 100, 0])
  assert.deepEqual(barPcts([null, 0]), [0, 0])
})

test('테이블 없음 판정', () => {
  assert.ok(isMissingTable({ code: '42P01' }))
  assert.ok(isMissingTable({ code: 'PGRST205' }))
  assert.ok(!isMissingTable({ code: '23505' }))
  assert.ok(!isMissingTable(null))
})
