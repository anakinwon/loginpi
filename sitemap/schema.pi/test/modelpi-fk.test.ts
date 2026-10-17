// FK 상속 계획(PRD_PiErd S1 L1) 검사 — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fkPlan, fkWant, type FkChildIn, type FkRelIn } from '../src/lib/modelpi/fk.ts'

const rel = (o: Partial<FkRelIn> = {}): FkRelIn => ({ rel_id: 'r1', prnt_ent_id: 'P', chld_ent_id: 'C', idnt_yn: 'N', prnt_opt_yn: 'N', ...o })
const pk = [{ attr_id: 'p1', term_id: 't-고객번호', term_log_nm: '고객번호' }]
const at = (o: Partial<FkChildIn>): FkChildIn => ({ attr_id: 'c1', term_id: 't-x', pk_yn: 'N', esntl_yn: 'N', fk_rel_id: null, src_attr_id: null, ...o })

test('관계 요구 상태 : 식별 = PK·필수, 비식별 부모 필수 = 필수, 부모 선택 = 선택', () => {
  assert.deepEqual(fkWant({ idnt_yn: 'Y', prnt_opt_yn: 'N' }), { pk: true, esntl: true })
  assert.deepEqual(fkWant({ idnt_yn: 'N', prnt_opt_yn: 'N' }), { pk: false, esntl: true })
  assert.deepEqual(fkWant({ idnt_yn: 'N', prnt_opt_yn: 'Y' }), { pk: false, esntl: false })
})

test('add : 자식에 없으면 상속 속성 추가', () => {
  assert.deepEqual(fkPlan(rel(), pk, []), [{ kind: 'add', src_attr_id: 'p1', term_id: 't-고객번호', term_log_nm: '고객번호', pk: false, esntl: true }])
  assert.equal(fkPlan(rel({ idnt_yn: 'Y' }), pk, [])[0].kind, 'add')
  assert.equal((fkPlan(rel({ idnt_yn: 'Y' }), pk, [])[0] as { pk: boolean }).pk, true)
})

test('link : 같은 용어 일반 속성은 이 관계 상속으로 연결, 다른 관계 상속은 건드리지 않음', () => {
  assert.equal(fkPlan(rel(), pk, [at({ term_id: 't-고객번호' })])[0].kind, 'link')
  assert.equal(fkPlan(rel(), pk, [at({ term_id: 't-고객번호', fk_rel_id: 'r1' })])[0].kind, 'link', '원천 미기록 옛 상속도 연결')
  assert.deepEqual(fkPlan(rel(), pk, [at({ term_id: 't-고객번호', fk_rel_id: 'r9', src_attr_id: 'p1' })]), [])
  assert.deepEqual(fkPlan(rel(), pk, [at({ term_id: 't-고객번호', pk_yn: 'Y', esntl_yn: 'Y' })]), [], '자식 자신의 PK 는 비식별 관계에서 건드리지 않음(강등 방지)')
  assert.equal(fkPlan(rel({ idnt_yn: 'Y' }), pk, [at({ term_id: 't-고객번호', pk_yn: 'Y', esntl_yn: 'Y' })])[0].kind, 'link', '식별 관계면 자식 PK 로 연결')
})

test('fix : 식별 여부·부모 선택성이 바뀌면 PK·필수 수정, 같으면 단계 없음', () => {
  const inh = at({ term_id: 't-고객번호', fk_rel_id: 'r1', src_attr_id: 'p1', esntl_yn: 'Y' })
  assert.deepEqual(fkPlan(rel(), pk, [inh]), [], '비식별·부모 필수 = 일반 필수 → 그대로')
  const f = fkPlan(rel({ idnt_yn: 'Y' }), pk, [inh])
  assert.equal(f[0].kind, 'fix')
  assert.equal((f[0] as { pk: boolean }).pk, true)
  assert.equal(fkPlan(rel({ prnt_opt_yn: 'Y' }), pk, [inh])[0].kind, 'fix', '부모 선택 → 필수 해제')
})

test('역할명 상속은 원천으로 인정, 자기참조는 계획 없음', () => {
  const role = at({ term_id: 't-발신고객번호', fk_rel_id: 'r1', src_attr_id: 'p1', esntl_yn: 'Y' })
  assert.deepEqual(fkPlan(rel(), pk, [role]), [])
  assert.deepEqual(fkPlan(rel({ chld_ent_id: 'P', prnt_opt_yn: 'Y' }), pk, []), [])
})

test('역할명 상속 필요 : 자기참조·다른 관계로 상속된 같은 용어·비식별인데 자식 자체 PK', async () => {
  const { fkNeeds } = await import('../src/lib/modelpi/fk.ts')
  assert.deepEqual(fkNeeds(rel({ chld_ent_id: 'P', prnt_opt_yn: 'Y' }), pk, []).map((n) => n.reason), ['SELF'])
  assert.deepEqual(fkNeeds(rel(), pk, [at({ term_id: 't-고객번호', fk_rel_id: 'r9', src_attr_id: 'p1' })]).map((n) => n.reason), ['OTHER_REL'])
  assert.deepEqual(fkNeeds(rel(), pk, [at({ term_id: 't-고객번호', pk_yn: 'Y', esntl_yn: 'Y' })]).map((n) => n.reason), ['OWN_PK'])
  assert.deepEqual(fkNeeds(rel(), pk, [at({ term_id: 't-수신고객번호', fk_rel_id: 'r1', src_attr_id: 'p1' })]), [], '이미 역할명으로 상속하면 필요 없음')
  assert.deepEqual(fkNeeds(rel(), pk, []), [], '같은 용어가 없으면 일반 add(역할명 불필요)')
})
