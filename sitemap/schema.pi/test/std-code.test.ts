// 공통코드 명명 규칙 검사(노트 4장 p141, 마스터 지시 2026-10-20) — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CD_VAL_BAD, basChgPath, cdKind, valTooLong } from '../src/lib/std-code-rule.ts'
import { mapHeader } from '../src/lib/bulk.ts'

test('공통코드 = ~구분코드·~종류코드·~유형코드 3종만', () => {
  assert.equal(cdKind('남녀구분코드'), 'DIV')
  assert.equal(cdKind('서비스종류코드'), 'KND')
  assert.equal(cdKind('지불수단종류코드'), 'KND')
  assert.equal(cdKind('거래유형코드'), 'TYP')
  assert.equal(cdKind('지불수단유형코드'), 'TYP')
})

test('그 외 코드·대상 없는 이름 = 공통코드 아님(별도 기본테이블)', () => {
  for (const nm of ['주문상태코드', '서비스코드', '은행코드', '구분코드', '종류코드', '유형코드', '', null, undefined]) assert.equal(cdKind(nm), null, String(nm))
})

test('표준코드 일괄등록 CSV 헤더 — 코드명·코드값·코드값명 필수', () => {
  const h = mapHeader('codes', ['코드명', '코드분류', '코드값', '코드값명', '정렬순서', '사용여부', '코드값설명'])
  assert.ok('idx' in h && h.idx.cd_nm === 0 && h.idx.val === 2 && h.idx.desc === 6)
  assert.deepEqual(mapHeader('codes', ['코드명', '코드값']), { missing: ['코드값명'] })
  assert.equal(valTooLong('ABC', 2), true)
  assert.equal(valTooLong('가나', 2), false, '문자 수 기준')
  assert.equal(valTooLong('X'.repeat(500), null), false, '도메인 길이 없음 = 제한 없음')
})

test('코드값 금지 문자 % / \\ ? # (경로 안전)', () => {
  for (const v of ['10%', 'A/B', 'A\\B', 'A?', '#1']) assert.ok(CD_VAL_BAD.test(v), v)
  for (const v of ['01', 'A 1', 'CARD', '가-나', 'A.B']) assert.ok(!CD_VAL_BAD.test(v), v)
})

test('코드기본 상태별 수정·삭제 처리(sql/061) — 승인대기 불가·반려 재신청/즉시 삭제·승인완료 신청', () => {
  assert.equal(basChgPath('REQ', 'UPD'), 'LOCKED')
  assert.equal(basChgPath('REQ', 'DEL'), 'LOCKED')
  assert.equal(basChgPath('RJCT', 'UPD'), 'RESUB')
  assert.equal(basChgPath('RJCT', 'DEL'), 'DROP')
  assert.equal(basChgPath('CNFM', 'UPD'), 'REQ')
  assert.equal(basChgPath('CNFM', 'DEL'), 'REQ')
})
