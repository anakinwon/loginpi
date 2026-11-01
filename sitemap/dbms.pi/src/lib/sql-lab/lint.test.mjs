// lint.ts 규칙 엔진 시험 — node --test src/lib/sql-lab/lint.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lintSql, expectedGroup } from './lint.ts'

const codes = (sql, d) => lintSql(sql, d).map((i) => i.code).sort()

test('안티패턴 탐지', () => {
  assert.deepEqual(codes('select * from t where a = 1'), ['SELECT_STAR'])
  assert.deepEqual(codes("select a from t where upper(nm) = 'X'"), ['FUNC_ON_COLUMN'])
  assert.deepEqual(codes("select a from t where to_char(reg_dtm, 'YYYY') = '2026'"), ['FUNC_ON_COLUMN'])
  assert.deepEqual(codes("select a from t where fst || lst = 'ab'"), ['FUNC_ON_COLUMN'])
  assert.deepEqual(codes("select a from t where title like '%pi'"), ['LEADING_WILDCARD'])
  assert.deepEqual(codes("select a from t where title = 'x' or body = 'y'"), ['OR_DIFF_COLUMNS'])
  assert.deepEqual(codes("select a from t where a = 'x' or a = 'y'"), [])
  assert.deepEqual(codes("select a from t where code = '123'"), ['IMPLICIT_CAST'])
  assert.deepEqual(codes('select a from t where b not in (select b from u)'), ['NOT_IN_SUBQUERY'])
  assert.deepEqual(codes('select a from big_t'), ['NO_WHERE'])
  assert.deepEqual(codes('select a from big_t limit 10'), [])
  assert.deepEqual(codes('-- select * from x\nselect a from t where a = 1'), [])
})

test('도메인 대조 — 접미사 기본값 + 표준 도메인 우선', () => {
  assert.deepEqual(codes("select a from t where pymnt_amt = '100'"), ['DOMAIN_MISMATCH'])
  assert.deepEqual(codes('select a from t where stts_cd = 10'), ['DOMAIN_MISMATCH'])
  assert.deepEqual(codes("select a from t where stts_cd = '10'"), [])
  assert.deepEqual(codes('select a from t where reg_dt = 20261101'), ['DOMAIN_MISMATCH'])
  // 표준에서 코드가 숫자 도메인이면 숫자 비교가 정상
  const d = [{ domNm: '상태코드', lgcTpCd: 'NUMERIC' }]
  assert.equal(expectedGroup('t.stts_cd', d), 'num')
  assert.deepEqual(codes('select a from t where stts_cd = 10', d), [])
  assert.equal(expectedGroup('foo'), null)
})
