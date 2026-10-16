// 감사 이력 변경 전후 비교 검사 — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditDiff } from '../src/lib/audit-diff.ts'

test('바뀐 항목만, 시스템 컬럼·버전 제외', () => {
  const d = auditDiff({ dic_desc: null, dic_phy_nm: 'ADDR', ver_no: 1, mod_dtm: 'a' }, { dic_desc: '거주지', dic_phy_nm: 'ADDR', ver_no: 2, mod_dtm: 'b' })
  assert.deepEqual(d, [{ key: 'dic_desc', before: null, after: '거주지' }])
})

test('등록(변경 전 없음)·삭제 표시', () => {
  assert.deepEqual(auditDiff(null, { a: 1 }), [{ key: 'a', before: null, after: 1 }])
  assert.deepEqual(auditDiff({ del_yn: 'N' }, { del_yn: 'Y' }), [{ key: 'del_yn', before: 'N', after: 'Y' }])
})

test('객체·배열 값 비교', () => {
  assert.equal(auditDiff({ x: [1, 2] }, { x: [1, 2] }).length, 0)
  assert.equal(auditDiff({ x: { k: 1 } }, { x: { k: 2 } }).length, 1)
})
