// 논리 모델 점검(FK 전파·정규화 의심·검증 요약)·Mermaid 내보내기 검사 — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkLogical, type LAttr, type LEnt, type LRel } from '../src/lib/modelpi/normalize.ts'
import { relMark, toMermaid } from '../src/lib/modelpi/erd.ts'
import type { EntWord } from '../src/lib/model-name.ts'

const W = (nm: string, clss = false): EntWord => ({ dic_id: nm, dic_log_nm: nm, dic_phy_nm: nm, attr_clss_yn: 'N', ent_clss_yn: clss ? 'Y' : 'N', forbid_yn: 'N', tbl_sfx_txt: null })
let n = 0
const A = (term: string, o: Partial<LAttr> = {}): LAttr => ({ attr_id: `a${++n}`, term_id: `t-${term}`, term_log_nm: term, term_phy_nm: `T_${n}`, dom_nm: '번호VC10', pk_yn: 'N', pk_seq: null, esntl_yn: 'Y', fk_rel_id: null, ver_no: 1, term_ok: true, ...o })
const E = (id: string, words: EntWord[], attrs: LAttr[]): LEnt => ({ ent_id: id, ent_log_nm: words.map((w) => w.dic_log_nm).join(''), tbl_phy_nm: `ECM_${id.toUpperCase()}`, ent_tp_cd: 'BASE', subj_nm: 's', words, attrs })
const R = (id: string, p: string, c: string, o: Partial<LRel> = {}): LRel => ({ rel_id: id, prnt_ent_id: p, chld_ent_id: c, rel_nm: id, crdn_cd: '1N', idnt_yn: 'N', prnt_opt_yn: 'N', chld_opt_yn: 'Y', ...o })

const cust = E('cust', [W('고객'), W('기본', true)], [A('고객번호', { pk_yn: 'Y', pk_seq: 1 }), A('고객명'), A('고객등록일시'), A('고객상태코드')])
const ord = E('ord', [W('주문'), W('기본', true)], [A('주문번호', { pk_yn: 'Y', pk_seq: 1 }), A('주문명'), A('주문일시'), A('주문상태코드'), A('고객명'), A('전화번호1'), A('전화번호2')])
const dtl = E('dtl', [W('주문'), W('상세', true)], [A('주문번호', { pk_yn: 'Y', pk_seq: 1, fk_rel_id: 'r2' }), A('주문일련번호', { pk_yn: 'Y', pk_seq: 2 }), A('주문일시'), A('상품수량')])
const lone = E('lone', [W('기타')], [])
const rels = [R('r1', 'cust', 'ord'), R('r2', 'ord', 'dtl', { idnt_yn: 'Y', chld_opt_yn: 'N' })]

test('FK 전파 누락 : 비식별 부모 PK 가 자식에 없으면 일반 FK(부모 필수 → 필수), 식별은 이미 있으면 제외', () => {
  const r = checkLogical([cust, ord, dtl], rels)
  assert.deepEqual(r.fkGaps.map((g) => [g.chld_nm, g.term_log_nm, g.pk, g.esntl]), [['주문기본', '고객번호', false, true]])
})

test('정규화 의심 : 1NF 반복 그룹·2NF 부모 수준 속성·3NF 참조 부모 속성 중복·4NF·STD', () => {
  const r = checkLogical([cust, ord, dtl], rels)
  const k = (kind: string) => r.issues.filter((i) => i.kind === kind)
  assert.equal(k('1NF').length, 1)
  assert.match(k('1NF')[0].msg, /전화번호1·전화번호2/)
  assert.deepEqual(k('2NF').map((i) => [i.ent_id, i.action, i.target_ent_id]), [['dtl', 'remove', 'ord']], '주문일시는 부모에도 있음 → 제거')
  assert.deepEqual(k('3NF').map((i) => [i.ent_id, i.action]), [['ord', 'remove']], '주문의 고객명 = 고객의 속성')
  const four = checkLogical([cust, ord, dtl, E('x', [W('조합'), W('관계', true)], [])], [...rels, R('a', 'cust', 'x', { idnt_yn: 'Y' }), R('b', 'ord', 'x', { idnt_yn: 'Y' }), R('c', 'dtl', 'x', { idnt_yn: 'Y' })])
  assert.equal(four.issues.filter((i) => i.kind === '4NF').length, 1)
  const bad = checkLogical([E('b', [W('고객')], [A('폐기용어', { term_ok: false })])], [])
  assert.equal(bad.issues[0].kind, 'STD')
})

test('2NF 이동 : 부모 수준 속성이 부모에 없으면 부모로 이동 제안', () => {
  const ord2 = E('ord', [W('주문'), W('기본', true)], [A('주문번호', { pk_yn: 'Y', pk_seq: 1 })])
  const r = checkLogical([ord2, dtl], [R('r2', 'ord', 'dtl', { idnt_yn: 'Y' })])
  assert.deepEqual(r.issues.filter((i) => i.kind === '2NF').map((i) => [i.action, i.target_ent_id]), [['move', 'ord']])
})

test('검증 요약 : 필수 4종·고아·FK 누락·통과율', () => {
  const r = checkLogical([cust, ord, dtl, lone], rels)
  const c = Object.fromEntries(r.checks.map((x) => [x.ent_id, x]))
  assert.equal(c.cust.pass, true)
  assert.equal(c.ord.fk_missing, 1)
  assert.equal(c.lone.orphan, true)
  assert.equal(c.lone.must, 0)
  assert.equal(r.summary.ents, 4)
  assert.equal(r.summary.passed, 1)
  assert.equal(r.summary.rate, 25)
})

test('Mermaid : 엔터티·PK/FK·관계 IE 표기', () => {
  assert.equal(relMark({ crdn_cd: '1N', idnt_yn: 'Y', prnt_opt_yn: 'N', chld_opt_yn: 'N' }), '||--|{')
  assert.equal(relMark({ crdn_cd: '1N', idnt_yn: 'N', prnt_opt_yn: 'Y', chld_opt_yn: 'Y' }), '|o..o{')
  assert.equal(relMark({ crdn_cd: 'NM', idnt_yn: 'N', prnt_opt_yn: 'N', chld_opt_yn: 'Y' }), '}o..o{')
  const m = toMermaid([cust, dtl], [R('r2', 'cust', 'dtl', { idnt_yn: 'Y', chld_opt_yn: 'N', rel_nm: '포함' })], '시험')
  assert.match(m, /^%% 시험/)
  assert.match(m, /erDiagram/)
  assert.match(m, /ECM_CUST \{\n    VC10 T_\d+ PK "고객번호 \(필수\)"/)
  assert.match(m, /VC10 T_\d+ PK, FK "주문번호/)
  assert.match(m, /ECM_CUST \|\|--\|\{ ECM_DTL : "포함"/)
})
