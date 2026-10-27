// seminar-rules.ts 판정 시험 — node src/lib/seminar-rules.test.mjs (Node 24 는 .ts 를 타입 제거로 바로 읽는다)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  capError,
  FEE_RE,
  formatFee,
  isUuid,
  joinError,
  prejoinHeading,
  pageCount,
  parsePage,
  parseTab,
  payErrorCode,
  START_AHEAD_MAX_MS,
  startAtOk,
  stalePayState,
} from './seminar-rules.ts'

test('탭·페이지 해석', () => {
  assert.equal(parseTab('hosted'), 'hosted')
  assert.equal(parseTab('joined'), 'joined')
  assert.equal(parseTab('x'), 'all')
  assert.equal(parseTab(null), 'all')
  assert.equal(parsePage('3'), 3)
  for (const v of ['0', '-1', '1.5', 'abc', '', null, '1001']) assert.equal(parsePage(v), 1)
  assert.equal(pageCount(0), 1)
  assert.equal(pageCount(12), 1)
  assert.equal(pageCount(13), 2)
})

test('입장료 표기·입력', () => {
  assert.equal(formatFee(0), null)
  assert.equal(formatFee('0.0000000'), null)
  assert.equal(formatFee(null), null)
  assert.equal(formatFee(1.5), '1.5')
  assert.equal(formatFee('2.0000000'), '2')
  assert.equal(formatFee(0.0000001), '0.0000001')
  assert.ok(FEE_RE.test('0'))
  assert.ok(FEE_RE.test('3.1415926'))
  assert.ok(!FEE_RE.test('3.14159265'))
  assert.ok(!FEE_RE.test('-1'))
  assert.ok(!FEE_RE.test('1e3'))
})

test('결과 코드 매핑', () => {
  assert.equal(joinError('OK'), null)
  assert.equal(joinError('ALREADY'), null)
  assert.deepEqual(joinError('FULL'), { code: 'SMN_FULL', status: 409 })
  assert.deepEqual(joinError('CLOSED'), { code: 'SMN_CLOSED', status: 409 })
  assert.deepEqual(joinError('PAY_REQUIRED'), { code: 'SMN_PAY_REQUIRED', status: 402 })
  assert.deepEqual(joinError('PAY_INVALID'), { code: 'SMN_PAY_INVALID', status: 400 })
  assert.deepEqual(joinError('NOT_FOUND'), { code: 'NOT_FOUND', status: 404 })
  assert.deepEqual(joinError(undefined), { code: 'INTERNAL', status: 500 })
  assert.equal(capError('OK'), null)
  assert.deepEqual(capError('ALREADY'), { code: 'SMN_ALREADY', status: 409 })
  assert.deepEqual(capError('FULL'), { code: 'SMN_FULL', status: 409 })
  assert.equal(payErrorCode('AMOUNT_MISMATCH'), 'PAY_AMOUNT_MISMATCH')
  assert.equal(payErrorCode('SMN_CLOSED'), 'SMN_CLOSED')
  assert.equal(payErrorCode('weird'), 'INTERNAL')
  assert.ok(isUuid('6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f'))
  assert.ok(!isUuid('lab-room'))
})

test('이전 APPROVED 결제 정리 판정(S2)', () => {
  const st = (cancelled, user_cancelled) => ({ ok: true, payment: { status: { cancelled, user_cancelled } } })
  assert.equal(stalePayState(st(true, false)), 'gone')
  assert.equal(stalePayState(st(false, true)), 'gone')
  assert.equal(stalePayState(st(false, false)), 'pending')
  assert.equal(stalePayState({ ok: false, status: 404 }), 'gone')
  // 타임아웃(0)·5xx·키 없음은 판정 불가 → 막는 쪽
  for (const status of [0, 500, 502]) assert.equal(stalePayState({ ok: false, status }), 'pending')
})

test('개설 시작일시 상한(S5)', () => {
  const now = 1_700_000_000_000
  assert.equal(startAtOk(now + 1, now), true)
  assert.equal(startAtOk(now + START_AHEAD_MAX_MS, now), true)
  assert.equal(startAtOk(now + START_AHEAD_MAX_MS + 1, now), false)
  assert.equal(startAtOk(now, now), false)
  assert.equal(startAtOk(NaN, now), false)
})

test('대기실 머리말 — 세미나 방은 h2 고정 문구(UUID 노출·h1 중복 없음), 실험실 방은 h1 방 코드', () => {
  assert.deepEqual(prejoinHeading('54000d08-4e41-4a6b-9c1d-0123456789ab'), { level: 2, key: 'titleSeminar' })
  assert.deepEqual(prejoinHeading('lab-room_1'), { level: 1, key: 'title' })
})
