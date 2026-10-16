// 도메인명 자동생성 규칙 검사 — 실행 : pnpm test (Node 내장 테스트, 타입 제거 실행)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { domName } from '../src/lib/dom-name.ts'

test('매뉴얼 예시와 동일', () => {
  assert.equal(domName('금액', 'DC', 18, 3), '금액DC18,3')
  assert.equal(domName('주소', 'VC', 100), '주소VC100')
  assert.equal(domName('고객번호', 'CH', 10, 0), '고객번호CH10')
})

test('길이 없는 타입은 약어까지만', () => {
  assert.equal(domName('등록', 'TMP'), '등록TMP')
  assert.equal(domName(' 일자 ', 'DT', null, null), '일자DT')
})
