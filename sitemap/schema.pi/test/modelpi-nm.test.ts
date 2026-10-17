// N:M 해소 교차 엔터티 이름 후보(PRD_PiErd S1 L3) 검사 — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nmNameCands } from '../src/lib/modelpi/nm.ts'
import type { EntWord } from '../src/lib/model-name.ts'

const W = (nm: string, phy: string, o: Partial<EntWord> = {}): EntWord => ({ dic_id: `id-${nm}`, dic_log_nm: nm, dic_phy_nm: phy, attr_clss_yn: 'N', ent_clss_yn: 'N', forbid_yn: 'N', tbl_sfx_txt: null, ...o })
const dict = [W('학생', 'STDT'), W('과목', 'SBJT'), W('수강', 'ATND'), W('기본', 'BASE', { ent_clss_yn: 'Y', tbl_sfx_txt: '_M' }), W('관계', 'REL', { ent_clss_yn: 'Y', tbl_sfx_txt: '_R' }), W('내역', 'DTLS', { ent_clss_yn: 'Y', tbl_sfx_txt: '_L' })]
const base = { prntNm: '학생기본', chldNm: '과목기본', relNm: null, dict, have: new Set<string>(), subjAbbr: 'EDU' }

test('후보 : 부모 줄기 + 자식 줄기 + 관계·내역, 표준단어 분해·물리명', () => {
  const r = nmNameCands(base)
  assert.deepEqual(r.map((x) => x.nm), ['학생과목관계', '학생과목내역'])
  assert.ok(r.every((x) => x.ok))
  assert.equal(r[0].tbl_phy_nm, 'TB_EDU_STDT_SBJT_R')
})

test('관계명이 있으면 관계명 기반 후보, 미등록 단어·기존 이름은 등록 불가로 뒤로', () => {
  const r = nmNameCands({ ...base, relNm: '수강', have: new Set(['학생과목관계']) })
  assert.ok(r.some((x) => x.nm === '수강내역' && x.ok))
  assert.ok(r.some((x) => x.nm === '학생수강내역' && x.ok))
  const dup = r.find((x) => x.nm === '학생과목관계')!
  assert.equal(dup.ok, false)
  assert.equal(dup.dup, true)
  assert.equal(r.at(-1)!.nm, '학생과목관계', '등록 불가 후보는 뒤로')
  const miss = nmNameCands({ ...base, relNm: '신청' }).find((x) => x.nm === '신청내역')!
  assert.deepEqual([miss.ok, miss.missing_words], [false, ['신청']])
})
