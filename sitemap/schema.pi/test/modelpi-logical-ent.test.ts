// 논리 엔터티 추천(AI·업종·규칙 합치기·표준단어 검증) 검사 — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TEMPLATES } from '../src/lib/modelpi/template.ts'
import { deriveCands, entStem, recommendLogical, LG_MAX } from '../src/lib/modelpi/logical-ent.ts'
import type { EntWord } from '../src/lib/model-name.ts'

const W = (nm: string, phy: string, o: Partial<EntWord> = {}): EntWord => ({ dic_id: `id-${nm}`, dic_log_nm: nm, dic_phy_nm: phy, attr_clss_yn: 'N', ent_clss_yn: 'N', forbid_yn: 'N', tbl_sfx_txt: null, ...o })
const dict = [W('고객', 'CUST'), W('주문', 'ORDR'), W('등급', 'GRD'), W('배송', 'DLVR'), W('기본', 'BASE', { ent_clss_yn: 'Y', tbl_sfx_txt: '_M' }), W('상세', 'DTL', { ent_clss_yn: 'Y', tbl_sfx_txt: '_D' }), W('이력', 'HIST', { ent_clss_yn: 'Y', tbl_sfx_txt: '_H' }), W('번호', 'NO', { attr_clss_yn: 'Y' })]
const base = { tmpl: null, subjNm: '주문', subjAbbr: 'ORD', subjEnts: [], have: new Set<string>(), dict }

test('줄기 : 분류어 떼기, 분류어만이면 그대로', () => {
  assert.equal(entStem('고객기본'), '고객')
  assert.equal(entStem('주문상세'), '주문')
  assert.equal(entStem('이력'), '이력')
  assert.equal(entStem('고객'), '고객')
})

test('규칙 파생 : 모든 엔터티 이력, 행위 엔터티만 상세(상세는 상세 안 만듦)', () => {
  const r = deriveCands([
    { ent_log_nm: '고객기본', ent_tp_cd: 'BASE' },
    { ent_log_nm: '주문기본', ent_tp_cd: 'ACT' },
    { ent_log_nm: '주문상세', ent_tp_cd: 'ACT' },
  ]).map((c) => c.nm)
  assert.deepEqual(r, ['고객이력', '주문이력', '주문상세', '주문이력'])
})

test('합치기 : AI 우선·중복·기존 이름 제외, 분해·물리명·미등록 단어', () => {
  const r = recommendLogical({
    ...base,
    subjEnts: [{ ent_log_nm: '주문기본', ent_tp_cd: 'ACT' }],
    have: new Set(['주문기본', '주문상세']),
    ai: [
      { nm: '주문 배송이력', tp: 'ACT', desc: ' 주문별 배송 상태 변경 ' },
      { nm: '주문기본', tp: 'ACT', desc: '이미 있음' },
      { nm: '주문결제내역', tp: 'ACT', desc: '결제' },
    ],
  })
  const by = new Map(r.map((x) => [x.nm, x]))
  assert.ok(!by.has('주문기본') && !by.has('주문상세'), '프로젝트 기존 이름 제외')
  const d = by.get('주문배송이력')!
  assert.equal(d.src, 'AI')
  assert.equal(d.ok, true)
  assert.equal(d.desc, '주문별 배송 상태 변경')
  assert.equal(d.tbl_phy_nm, 'TB_ORD_ORDR_DLVR_H')
  assert.equal(by.get('주문이력')?.src, 'rule')
  const bad = by.get('주문결제내역')!
  assert.equal(bad.ok, false)
  assert.ok(bad.missing_words.length > 0)
  assert.equal(r.at(-1)!.nm, '주문결제내역', '바로 등록 불가 후보는 뒤로')
})

test('이름 규칙 위반(속성 분류어로 끝남)은 등록 불가', () => {
  const r = recommendLogical({ ...base, ai: [{ nm: '주문번호', tp: 'BASE', desc: 'x' }] })
  assert.equal(r[0].ok, false)
  assert.ok(r[0].rule_error)
})

test('업종 템플릿 : 같은 주제영역 엔터티, 상한', () => {
  const t = TEMPLATES.ECOM
  const subj = t.entities[0].subj
  const r = recommendLogical({ ...base, tmpl: t, subjNm: subj })
  assert.ok(r.some((x) => x.src === 'industry'))
  assert.ok(r.every((x) => x.src !== 'industry' || t.entities.some((e) => e.subj === subj && e.desc === x.desc)))
  const many = recommendLogical({ ...base, ai: Array.from({ length: 30 }, (_, i) => ({ nm: `주문${'이력'.repeat(1)}${i}`, tp: 'ACT' as const, desc: '' })) })
  assert.ok(many.length <= LG_MAX)
})
