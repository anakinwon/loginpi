// 개념 모델 관계 규칙 검사(PRD §2.5 MD1) — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { relError, relNotation } from '../src/lib/model-rel.ts'

const R = (o: Partial<Parameters<typeof relError>[0]> = {}) => ({ prnt_ent_id: 'A', chld_ent_id: 'B', crdn_cd: '1N', idnt_yn: 'N', prnt_opt_yn: 'N', ...o })

test('관계 규칙 : 식별은 N:M·자기참조·부모 선택 불가, 자기참조는 부모 선택', () => {
  assert.equal(relError(R()), null)
  assert.equal(relError(R({ crdn_cd: 'NM' })), null, '비식별 N:M 허용')
  assert.equal(relError(R({ chld_ent_id: 'A', prnt_opt_yn: 'Y' })), null, '비식별 자기참조(부모 선택) 허용')
  assert.equal(relError(R({ chld_ent_id: 'A' })), 'REL_SELF_OPT', '자기참조 부모 필수 거부(최상위 행 입력 불가)')
  assert.equal(relError(R({ idnt_yn: 'Y' })), null, '식별 1:N 부모 필수')
  assert.equal(relError(R({ idnt_yn: 'Y', crdn_cd: 'NM' })), 'REL_NM_IDNT')
  assert.equal(relError(R({ idnt_yn: 'Y', chld_ent_id: 'A' })), 'REL_SELF_IDNT')
  assert.equal(relError(R({ idnt_yn: 'Y', prnt_opt_yn: 'Y' })), 'REL_IDNT_OPT')
})

test('IE 표기 : 선택성·식별·카디널리티', () => {
  assert.equal(relNotation({ ...R(), chld_opt_yn: 'Y' }), '┼╌╌╌╌○<')
  assert.equal(relNotation({ ...R({ idnt_yn: 'Y' }), chld_opt_yn: 'N' }), '┼────┼<')
  assert.equal(relNotation({ ...R({ crdn_cd: '11', prnt_opt_yn: 'Y' }), chld_opt_yn: 'N' }), '○╌╌╌╌┼┼')
  assert.equal(relNotation({ ...R({ crdn_cd: 'NM' }), chld_opt_yn: 'Y' }), '>┼╌╌╌╌><')
})
