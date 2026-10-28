// seminar-rules.ts 판정 시험 — node src/lib/seminar-rules.test.mjs (Node 24 는 .ts 를 타입 제거로 바로 읽는다)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  capError,
  clampPage,
  FEE_RE,
  formatFee,
  isUuid,
  joinError,
  ONE_LINE_RE,
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

test('쪽 맞추기 — 목록이 줄어 현재 쪽이 넘치면 마지막 쪽(T04 r2 : Q&A 빈 2쪽에 갇힘)', () => {
  assert.equal(clampPage(2, 1), 1) // 2쪽 마지막 질문 답변 → 1쪽
  assert.equal(clampPage(3, 2), 2)
  assert.equal(clampPage(2, 3), 2) // 그대로
  assert.equal(clampPage(1, 0), 1) // 빈 목록도 1쪽
  assert.equal(clampPage(5, 0), 1)
})

// 결함 T01 r4 : 세미나·회의록 제목 검사가 trim·길이뿐이라 API 직접 호출로 줄바꿈·제어문자 제목을 저장할 수 있었음(.ics·메일 제목·Markdown 으로 흘러감)
test('한 줄 제목 — 줄바꿈·단독 \\r·NUL·DEL 거부, TAB·일반 글자·이모지 허용', () => {
  for (const bad of ['a\nb', 'a\rATTENDEE:x', 'a\u0000', 'a\u007F', 'a\u001Fb']) assert.ok(!ONE_LINE_RE.test(bad), JSON.stringify(bad))
  for (const ok of ['파이 세미나; 1부, 입문\\심화', 'Pi 🎉 2026', 'a\tb']) assert.ok(ONE_LINE_RE.test(ok))
})

// 결함 T01 r6 : C1 제어문자(NEL U+0085 등)·줄/문단 구분자(U+2028·2029)는 통과했음 — 범용 줄 나누기 파서가 줄바꿈으로 읽는다
test('한 줄 제목 — NEL·C1 제어문자·U+2028·U+2029 거부, 바로 옆 글자(U+00A0·é)는 허용', () => {
  for (const bad of ['a\u0085ATTENDEE:x', 'a\u0080', 'a\u009F', 'a\u2028b', 'a\u2029b']) assert.ok(!ONE_LINE_RE.test(bad), JSON.stringify(bad))
  for (const ok of ['a b', 'PyCafé™', 'a‧b']) assert.ok(ONE_LINE_RE.test(ok), JSON.stringify(ok))
})
