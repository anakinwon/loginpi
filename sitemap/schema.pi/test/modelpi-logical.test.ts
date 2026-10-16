// ModelPi 논리모델 추천(주식별자·필수 속성) 검사 — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entCore, recommendAttrs, type ParentKey, type TermRow } from '../src/lib/modelpi/logical.ts'
import type { EntWord } from '../src/lib/model-name.ts'

const W = (nm: string, o: Partial<EntWord> = {}): EntWord => ({ dic_id: nm, dic_log_nm: nm, dic_phy_nm: nm, attr_clss_yn: 'N', ent_clss_yn: 'N', forbid_yn: 'N', tbl_sfx_txt: null, ...o })
const C = (nm: string) => W(nm, { ent_clss_yn: 'Y', tbl_sfx_txt: '_X' })
const T = (nm: string): TermRow => ({ term_id: `t-${nm}`, term_log_nm: nm, term_phy_nm: nm.toUpperCase(), dom_nm: '번호VC10' })
const terms = ['고객번호', '고객명', '고객구분코드', '고객상태코드', '고객등급코드', '주문번호', '주문금액', '주문일련번호', '유효시작일시', '상품번호', '상품명'].map(T)
const base = { tmpl: null, parents: [] as ParentKey[], terms, have: new Set<string>() }

test('핵심어 : 끝 엔터티 분류어 제외', () => {
  assert.deepEqual(entCore([W('주문'), C('상세')]), { core: '주문', clss: '상세', head: '주문' })
  assert.equal(entCore([W('고객'), W('등급'), C('이력')]).core, '고객등급')
  assert.equal(entCore([W('고객')]).clss, null)
})

test('기본 엔터티 : PK ~번호, 필수 = 이름 + 상태·구분 코드 2개', () => {
  const r = recommendAttrs({ ...base, words: [W('고객'), C('기본')], tp: 'BASE' })
  assert.deepEqual(r.pk.map((c) => [c.term_log_nm, c.missing]), [['고객번호', false]])
  assert.deepEqual(r.required.map((c) => c.term_log_nm), ['고객명', '고객구분코드', '고객상태코드'])
  assert.ok(r.required.every((c) => c.esntl))
})

test('상세 엔터티 : 식별 관계 부모 PK 상속 + 순번', () => {
  const parents: ParentKey[] = [{ rel_id: 'r1', idnt_yn: 'Y', prnt_opt_yn: 'N', prnt_nm: '주문기본', pk: [T('주문번호')] }]
  const r = recommendAttrs({ ...base, parents, words: [W('주문'), C('상세')], tp: 'ACT' })
  assert.deepEqual(r.pk.map((c) => [c.term_log_nm, c.src]), [['주문번호', 'inherit'], ['주문일련번호', 'rule']])
  assert.equal(r.pk[0].fk_rel_id, 'r1')
})

test('이력 : 부모 없으면 경고, 유효시작일시 후보 / 관계 엔터티 : 부모 2개 미만 경고', () => {
  const h = recommendAttrs({ ...base, words: [W('고객'), W('등급'), C('이력')], tp: 'ACT' })
  assert.equal(h.pk[0].term_log_nm, '유효시작일시')
  assert.ok(h.warn.some((x) => x.includes('이력')))
  const rel = recommendAttrs({ ...base, words: [W('행사'), W('상품'), C('관계')], tp: 'BASE' })
  assert.equal(rel.pk.length, 0)
  assert.ok(rel.warn.some((x) => x.includes('양쪽 부모')))
})

test('행위 : 일시 없으면 용어 신청(missing), 측정값은 있는 것만, 비식별 부모 = FK(부모 필수면 필수)', () => {
  const parents: ParentKey[] = [{ rel_id: 'r2', idnt_yn: 'N', prnt_opt_yn: 'N', prnt_nm: '고객기본', pk: [T('고객번호')] }]
  const r = recommendAttrs({ ...base, parents, words: [W('주문'), C('기본')], tp: 'ACT' })
  assert.equal(r.pk[0].term_log_nm, '주문번호')
  const fk = r.required.find((c) => c.role === 'FK')!
  assert.deepEqual([fk.term_log_nm, fk.esntl, fk.fk_rel_id], ['고객번호', true, 'r2'])
  const dt = r.required.find((c) => c.term_log_nm === '주문일시')!
  assert.equal(dt.missing, true)
  assert.ok(r.required.some((c) => c.term_log_nm === '주문금액' && !c.missing))
  assert.ok(!r.required.some((c) => c.term_log_nm === '주문수량'), '없는 측정값은 숨김')
})

test('등록된 속성 제외·복합 PK 3개 초과 경고·업종 템플릿 우선', () => {
  const r = recommendAttrs({ ...base, have: new Set(['고객번호', '고객명']), words: [W('고객'), C('기본')], tp: 'BASE' })
  assert.equal(r.pk.length, 0)
  assert.ok(!r.required.some((c) => c.term_log_nm === '고객명'))
  const parents: ParentKey[] = [{ rel_id: 'r', idnt_yn: 'Y', prnt_opt_yn: 'N', prnt_nm: 'A', pk: ['가번호', '나번호', '다번호'].map(T) }]
  const many = recommendAttrs({ ...base, parents, words: [W('주문'), C('상세')], tp: 'ACT' })
  assert.ok(many.warn.some((x) => x.includes('인조 식별자')))
  const tm = recommendAttrs({ ...base, tmpl: { terms: ['고객번호', '고객명', '휴대전화번호'], pk: ['고객번호'] }, words: [W('고객'), C('기본')], tp: 'BASE' })
  assert.equal(tm.pk[0].src, 'industry')
  assert.ok(tm.required.some((c) => c.term_log_nm === '휴대전화번호' && c.missing && c.src === 'industry'))
})
