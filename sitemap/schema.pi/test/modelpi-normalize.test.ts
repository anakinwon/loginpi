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

const cust = E('cust', [W('고객'), W('기본', true)], [A('고객번호', { pk_yn: 'Y', pk_seq: 1 }), A('고객명'), A('고객등록일시'), A('고객상태유형코드')])
const ord = E('ord', [W('주문'), W('기본', true)], [A('주문번호', { pk_yn: 'Y', pk_seq: 1 }), A('주문명'), A('주문일시'), A('주문상태유형코드'), A('고객명'), A('전화번호1'), A('전화번호2')])
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

test('역할명 상속(sql/027 src_attr_id) : 다른 용어라도 원천이 부모 PK 면 FK 충족, 자기참조는 역할 속성이 있어야 검토 해소', () => {
  const custPk = cust.attrs[0]
  const trn = E('trn', [W('송금'), W('기본', true)], [A('송금번호', { pk_yn: 'Y', pk_seq: 1 }), A('발신고객번호', { fk_rel_id: 'rs', src_attr_id: custPk.attr_id }), A('수신고객번호', { fk_rel_id: 'rr', src_attr_id: custPk.attr_id })])
  const r = checkLogical([cust, trn], [R('rs', 'cust', 'trn'), R('rr', 'cust', 'trn')])
  assert.equal(r.fkGaps.length, 0, '같은 부모 2회 상속(역할명)도 누락 아님')
  const g = checkLogical([cust, E('trn2', [W('송금'), W('기본', true)], [A('송금번호', { pk_yn: 'Y', pk_seq: 1 })])], [R('rx', 'cust', 'trn2')]).fkGaps
  assert.deepEqual(g.map((x) => [x.term_log_nm, x.src_attr_id]), [['고객번호', custPk.attr_id]], '누락 FK 는 원천 속성 ID 를 함께 돌려줌(적용 시 src_attr_id)')
  const org = E('org', [W('조직'), W('기본', true)], [A('조직번호', { pk_yn: 'Y', pk_seq: 1 })])
  const selfRel = R('rself', 'org', 'org', { prnt_opt_yn: 'Y' })
  assert.ok(checkLogical([org], [selfRel]).issues.some((i) => i.kind === 'KEY' && /자기참조/.test(i.msg)), '역할 속성 없으면 검토')
  const org2 = { ...org, attrs: [...org.attrs, A('상위조직번호', { esntl_yn: 'N', fk_rel_id: 'rself', src_attr_id: org.attrs[0].attr_id })] }
  assert.ok(!checkLogical([org2], [selfRel]).issues.some((i) => i.kind === 'KEY' && /자기참조/.test(i.msg)), '상위~ 역할 속성 있으면 해소')
})

test('FK 누락 : 같은 용어가 다른 관계로 이미 상속되면 역할명 필요 누락(role)으로 보고', () => {
  const custPk = cust.attrs[0]
  const o2 = E('o2', [W('주문'), W('기본', true)], [A('주문번호', { pk_yn: 'Y', pk_seq: 1 }), A('고객번호', { fk_rel_id: 'ra', src_attr_id: custPk.attr_id })])
  const g = checkLogical([cust, o2], [R('ra', 'cust', 'o2'), R('rb', 'cust', 'o2')]).fkGaps
  assert.deepEqual(g.map((x) => [x.rel_id, x.role]), [['rb', true]])
})

test('N:M 관계 : 상속 점검 없이 해소 필요(split) 이슈로 통과 막음', () => {
  const r = checkLogical([cust, ord], [R('rn', 'cust', 'ord', { crdn_cd: 'NM', prnt_opt_yn: 'Y' })])
  assert.equal(r.fkGaps.length, 0)
  const i = r.issues.find((x) => /N:M/.test(x.msg))!
  assert.equal(i.action, 'split')
  assert.equal(r.checks.find((c) => c.ent_id === 'ord')!.pass, false)
})

test('모델 검토(L4) : 물리명 중복·이름 길이·필수 관계 FK 선택은 수정 필요, 설명·속성 없음은 검토', () => {
  const a1 = { ...E('d1', [W('주문'), W('기본', true)], [A('주문번호', { pk_yn: 'Y', pk_seq: 1 })]), tbl_phy_nm: 'ECM_DUP_M', ent_desc: '설명' }
  const a2 = { ...E('d2', [W('주문'), W('상세', true)], []), tbl_phy_nm: 'ECM_DUP_M' }
  const longE = { ...E('lg', [W('고객'), W('기본', true)], [A('고객번호', { pk_yn: 'Y', pk_seq: 1, term_phy_nm: 'X'.repeat(31) })]), tbl_phy_nm: 'T'.repeat(31), ent_desc: '설명' }
  const fkOpt = { ...E('fo', [W('송금'), W('기본', true)], [A('송금번호', { pk_yn: 'Y', pk_seq: 1 }), A('고객번호', { fk_rel_id: 'rq', esntl_yn: 'N' })]), ent_desc: '설명' }
  const r = checkLogical([cust, a1, a2, longE, fkOpt], [R('rq', 'cust', 'fo')], { dbms: '0001' })
  const rev = (id: string) => r.issues.filter((i) => i.kind === 'REV' && i.ent_id === id)
  assert.ok(rev('d1').some((i) => /중복/.test(i.msg) && i.action === 'fix'))
  assert.ok(rev('d2').some((i) => /속성이 없는/.test(i.msg) && i.action === 'review'))
  assert.ok(rev('d2').some((i) => /설명이 없/.test(i.msg) && i.action === 'review'))
  assert.equal(rev('lg').filter((i) => /자 > /.test(i.msg) && i.action === 'fix').length, 2, '테이블·칼럼 길이(Oracle 30)')
  assert.ok(rev('fo').some((i) => /필수 관계/.test(i.msg) && i.action === 'fix'))
  assert.equal(r.checks.find((c) => c.ent_id === 'fo')!.pass, false)
  assert.ok(r.summary.rev >= 4)
})

test('표준 정합(L5) : 엔터티명 표류·구성 단어 폐기는 수정 필요', () => {
  const drift = { ...E('dr', [W('고객'), W('기본', true)], [A('고객번호', { pk_yn: 'Y', pk_seq: 1 })]), ent_log_nm: '회원기본', ent_desc: 'x' }
  const bad = { ...E('bd', [W('주문'), W('기본', true)], [A('주문번호', { pk_yn: 'Y', pk_seq: 1 })]), dic_bad: 1, ent_desc: 'x' }
  const r = checkLogical([drift, bad], [])
  assert.ok(r.issues.some((i) => i.ent_id === 'dr' && i.kind === 'STD' && /표류/.test(i.msg) && i.action === 'fix'))
  assert.ok(r.issues.some((i) => i.ent_id === 'bd' && i.kind === 'STD' && /폐기·미승인/.test(i.msg)))
  assert.equal(r.summary.std, 2)
})

test('테이블명 한도 = min(25, DBMS) : PostgreSQL 26자도 수정 필요(엔터티 미리보기와 같은 기준)', () => {
  const t26 = { ...E('t26', [W('고객'), W('기본', true)], [A('고객번호', { pk_yn: 'Y', pk_seq: 1 })]), tbl_phy_nm: 'T'.repeat(26), ent_desc: 'x' }
  assert.ok(checkLogical([t26], [], { dbms: '0014' }).issues.some((i) => i.kind === 'REV' && /26자 > 한도 25자/.test(i.msg)))
})
