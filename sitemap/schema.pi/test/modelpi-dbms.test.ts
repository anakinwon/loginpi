// DBMS 프로파일·대소문자·추천 검사 — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DBMS_CDS, DBMS_PRFL, defaultCase, recommendDbms, renderIdent } from '../src/lib/modelpi/dbms.ts'
import { readFileSync } from 'node:fs'

test('대·소문자 : 모델링까지 대문자, 물리 전환 시 선택(기본 제안 Oracle·Tibero 대문자 / PostgreSQL 소문자)', () => {
  assert.equal(renderIdent('ecm_cst_cust_m'), 'ECM_CST_CUST_M', '기본 = 대문자')
  assert.equal(renderIdent('ECM_CST_CUST_M', 'lower'), 'ecm_cst_cust_m')
  assert.equal(defaultCase('0001'), 'upper')
  assert.equal(defaultCase('0013'), 'upper')
  assert.equal(defaultCase('0014'), 'lower')
  assert.equal(defaultCase(null), 'upper')
})

test('프로파일 : 지원 3종 = sql/024 기준 데이터, 식별자 길이', () => {
  const sql = readFileSync(new URL('../sql/024_mdl_prj_trgt_dbms.sql', import.meta.url), 'utf8')
  for (const cd of DBMS_CDS) assert.ok(sql.includes(`'${cd}'`), cd)
  assert.equal(DBMS_PRFL['0001'].identMax, 30)
  assert.equal(DBMS_PRFL['0014'].identMax, 63)
})

test('DBMS 추천 : 금융·공공 Oracle, 그 외·미지정 PostgreSQL', () => {
  assert.equal(recommendDbms('FIN').cd, '0001')
  assert.equal(recommendDbms('PUB').cd, '0001')
  assert.equal(recommendDbms('ECOM').cd, '0014')
  assert.equal(recommendDbms(null).cd, '0014')
})
