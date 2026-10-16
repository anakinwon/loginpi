// ModelPi 개념모델 추천(주제영역·핵심 엔터티·관계) 검사 — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TEMPLATES } from '../src/lib/modelpi/template.ts'
import { recommendEntities, recommendRelations, recommendSubjects, resolveName } from '../src/lib/modelpi/concept.ts'
import type { EntWord } from '../src/lib/model-name.ts'

const W = (nm: string, phy: string, o: Partial<EntWord> = {}): EntWord => ({ dic_id: `id-${nm}`, dic_log_nm: nm, dic_phy_nm: phy, attr_clss_yn: 'N', ent_clss_yn: 'N', forbid_yn: 'N', tbl_sfx_txt: null, ...o })
const dict = [W('고객', 'CUST'), W('주문', 'ORD'), W('상품', 'PRD'), W('등급', 'GRD'), W('기본', 'BASE', { ent_clss_yn: 'Y', tbl_sfx_txt: '_M' }), W('상세', 'DTL', { ent_clss_yn: 'Y', tbl_sfx_txt: '_D' }), W('이력', 'HIST', { ent_clss_yn: 'Y', tbl_sfx_txt: '_H' }), W('상태', 'STTS')]
const E = TEMPLATES.ECOM

test('표준단어 분해 : 미등록 구간은 missing', () => {
  assert.deepEqual(resolveName('고객등급', dict).missing, [])
  assert.deepEqual(resolveName('배송', dict).missing, ['배송'])
})

test('주제영역 추천 : 이미 있는 이름 제외, 약어 충돌 시 대안, 표준 여부', () => {
  const r = recommendSubjects(E, [{ subj_nm: '고객', subj_abbr_nm: 'CST' }, { subj_nm: '기타', subj_abbr_nm: 'PRD' }], dict)
  assert.ok(!r.some((s) => s.nm === '고객'))
  const prd = r.find((s) => s.nm === '상품')!
  assert.notEqual(prd.abbr, 'PRD', '프로젝트에서 쓰는 약어는 대안으로')
  assert.match(prd.abbr, /^[A-Z]{3}$/)
  assert.equal(prd.std_ok, true)
  const dlv = r.find((s) => s.nm === '배송')!
  assert.equal(dlv.std_ok, false)
  assert.deepEqual(dlv.missing_words, ['배송'])
  assert.equal(new Set(r.map((s) => s.abbr)).size, r.length, '추천끼리 약어 중복 없음')
})

test('핵심 엔터티 추천 : 주제영역 일치·분류어 접미어·미등록 단어·기존 제외', () => {
  const r = recommendEntities(E, '고객', 'CST', new Set(['고객기본']), dict)
  assert.ok(!r.some((e) => e.ent_log_nm === '고객기본'))
  const grd = r.find((e) => e.ent_log_nm === '고객등급이력')!
  assert.equal(grd.ok, true)
  assert.equal(grd.tbl_phy_nm, 'TB_CST_CUST_GRD_H')
  assert.equal(grd.ent_tp_cd, 'ACT')
  assert.equal(grd.dic_ids.length, 3)
  const addr = r.find((e) => e.ent_log_nm === '고객주소정보')!
  assert.equal(addr.ok, false)
  assert.ok(addr.missing_words.length > 0)
  const ord = recommendEntities(E, '주문', 'ORD', new Set(), dict)
  assert.ok(ord.find((e) => e.ent_log_nm === '주문상세')?.ok)
  assert.ok(ord.find((e) => e.ent_log_nm === '주문상태이력')?.ok)
})

test('관계 추천 : 양쪽 엔터티가 등록된 템플릿 관계만, 기존 관계 제외', () => {
  const ents = [{ ent_id: 'a', ent_log_nm: '고객기본' }, { ent_id: 'b', ent_log_nm: '주문기본' }, { ent_id: 'c', ent_log_nm: '주문상세' }]
  const r = recommendRelations(E, ents, [{ prnt_ent_id: 'b', chld_ent_id: 'c', rel_nm: '포함' }])
  assert.deepEqual(r.map((x) => `${x.prnt_nm}>${x.chld_nm}`), ['고객기본>주문기본'])
  assert.equal(r[0].idnt_yn, 'N')
})
