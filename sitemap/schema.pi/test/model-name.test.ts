// 개념 모델 엔터티 이름 규칙 검사(PRD §2.5 MD1) — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entNameError, entNames, subjAbbrCands, type EntWord } from '../src/lib/model-name.ts'

const W = (nm: string, phy: string, o: Partial<EntWord> = {}): EntWord => ({ dic_id: nm, dic_log_nm: nm, dic_phy_nm: phy, attr_clss_yn: 'N', ent_clss_yn: 'N', forbid_yn: 'N', tbl_sfx_txt: null, ...o })
const 고객 = W('고객', 'CUST'), 등급 = W('등급', 'GRD'), 이력 = W('이력', 'HSTRY', { ent_clss_yn: 'Y', tbl_sfx_txt: '_H' })
const 번호 = W('번호', 'NO', { attr_clss_yn: 'Y' }), 코드 = W('코드', 'CD', { attr_clss_yn: 'Y', ent_clss_yn: 'Y', tbl_sfx_txt: '_C' })
const 집계 = W('집계', 'TOT', { ent_clss_yn: 'Y', tbl_sfx_txt: '_T' }), 금지 = W('금지', 'BAN', { forbid_yn: 'Y' })

test('물리 테이블명 : 끝 엔터티 분류어는 접미어로', () => {
  assert.deepEqual(entNames([고객, 등급, 이력], 'CCS'), { ent_log_nm: '고객등급이력', tbl_phy_nm: 'TB_CCS_CUST_GRD_H', tbl_sfx_txt: '_H', too_long: false })
  assert.equal(entNames([고객], 'CCS').tbl_phy_nm, 'TB_CCS_CUST')
  assert.equal(entNames([W('부서', 'DEPT'), 코드], 'CCM').tbl_phy_nm, 'TB_CCM_DEPT_C')
  assert.equal(entNames([W('주민등록번호확인요청', 'RRNVERIFYREQ'), 고객, 등급], 'CCS').too_long, true)
})

test('이름 규칙 : 금칙어·속성 분류어 끝·집계', () => {
  assert.equal(entNameError([고객, 등급, 이력], 'BASE'), null)
  assert.equal(entNameError([고객, 금지], 'BASE'), 'ENT_FORBIDDEN_WORD')
  assert.equal(entNameError([고객, 번호], 'BASE'), 'ENT_LAST_ATTR')
  assert.equal(entNameError([W('부서', 'DEPT'), 코드], 'BASE'), null, '속성·엔터티 겸용(코드) 허용')
  assert.equal(entNameError([고객, 등급], 'AGG'), 'ENT_AGG_SUFFIX')
  assert.equal(entNameError([고객, 집계], 'AGG'), null)
  assert.equal(entNameError([], 'BASE'), 'INVALID_INPUT')
})

test('주제영역 약어 3자 : 이커머스 예시', () => {
  for (const [eng, want] of [['Customer', 'CST'], ['Product', 'PRD'], ['Order', 'ORD'], ['Claim', 'CLM'], ['Delivery', 'DLV'], ['Supply Chain', 'SCH']]) assert.equal(subjAbbrCands(eng)[0], want, eng)
  assert.ok(subjAbbrCands('Customer').length > 1, '중복 대비 대안')
  assert.deepEqual(subjAbbrCands(''), [])
})

test('스키마 접두사(sql/023) : 프로젝트 접두사로 시작, 형식 밖이면 기본 TB', () => {
  assert.equal(entNames([고객, 등급, 이력], 'CCS', 'ECOM').tbl_phy_nm, 'ECOM_CCS_CUST_GRD_H')
  assert.equal(entNames([고객], 'CCS', 'EC').tbl_phy_nm, 'EC_CCS_CUST')
  assert.equal(entNames([고객], 'CCS').tbl_phy_nm, 'TB_CCS_CUST')
  assert.equal(entNames([고객], 'CCS', 'ec1').tbl_phy_nm, 'TB_CCS_CUST')
})

test('대상 DBMS(sql/024) : 물리 모델링까지 DBMS 와 무관하게 대문자, 길이 경고만 DBMS 기준', () => {
  assert.equal(entNames([고객, 등급, 이력], 'CCS', 'ECM', '0014').tbl_phy_nm, 'ECM_CCS_CUST_GRD_H')
  assert.equal(entNames([고객, 등급, 이력], 'CCS', 'ECM', '0001').tbl_phy_nm, 'ECM_CCS_CUST_GRD_H')
  assert.equal(entNames([고객], 'CCS', 'ECM').tbl_phy_nm, 'ECM_CCS_CUST')
})
