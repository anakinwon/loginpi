// seminar-rules.ts 판정 시험 — node src/lib/seminar-rules.test.mjs (Node 24 는 .ts 를 타입 제거로 바로 읽는다)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calRangeOk,
  CAL_SPAN_MAX_MS,
  smnPast,
  capError,
  clampPage,
  FEE_RE,
  pickPlan,
  STATE_MARK,
  stateFromChat,
  formatFee,
  isUuid,
  joinError,
  ONE_LINE_RE,
  prejoinHeading,
  pageCount,
  roomPage,
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
  // 승인·미서명 : 3분(SIGN_WAIT_MS) 안 = 서명 대기(막음), 지나면 버린 결제(막지 않음), 서명돼 거래 있음 = 진행 중(막음) — 2026-10-29 실기기 잔액 부족 뒤 409 고착
  const now = Date.parse('2026-10-29T00:00:00Z')
  const p = (created, txid) => ({ ok: true, payment: { status: { cancelled: false, user_cancelled: false }, transaction: txid ? { txid } : null, created_at: created } })
  assert.equal(stalePayState(st(false, false), now), 'pending') // 생성 시각 모름 = 막는 쪽
  assert.equal(stalePayState(p('2026-10-28T23:58:00Z'), now), 'pending') // 2분 전 = 서명 대기
  assert.equal(stalePayState(p('2026-10-28T23:50:00Z'), now), 'abandoned') // 10분 전·거래 없음
  assert.equal(stalePayState(p('2026-10-28T23:50:00Z', 'tx1'), now), 'pending') // 서명됨
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

// 세미나 만들기 기본 요금제(마스터 2026-10-29) — 가입 중 유료(남은 시간 > 0)가 있으면 그것, 둘 다면 늦게 끝나는 쪽, 없으면 무료
test('pickPlan — 가입 중 유료 요금제 자동 선택', () => {
  assert.equal(pickPlan(null), 'FREE')
  assert.equal(pickPlan({ FREE: { sec: 3600, endAt: '2026-11-01T00:00:00Z' } }), 'FREE')
  assert.equal(pickPlan({ M: { sec: 0, endAt: '2026-11-20T00:00:00Z' } }), 'FREE') // 다 쓴 이용권은 가입 아님
  assert.equal(pickPlan({ M: { sec: 100, endAt: '2026-11-20T00:00:00Z' } }), 'M')
  assert.equal(pickPlan({ M: { sec: 100, endAt: '2026-11-20T00:00:00Z' }, Y: { sec: 100, endAt: '2027-10-01T00:00:00Z' } }), 'Y')
  assert.equal(pickPlan({ M: { sec: 100, endAt: '2027-12-01T00:00:00Z' }, Y: { sec: 100, endAt: '2027-10-01T00:00:00Z' } }), 'M')
  assert.equal(pickPlan({ M: { sec: 100, endAt: null }, Y: { sec: 100, endAt: null } }), 'Y') // 같으면 연간
})

// 구 엔진 상태 표식(녹화 고지 채팅 예비 통로, 마스터 2026-10-29) — 작은 JSON 객체만, 그 밖은 버림
test('stateFromChat — 녹화 고지 채팅 표식 해석', () => {
  assert.deepEqual(stateFromChat(STATE_MARK + '{"recording":true}'), { recording: true })
  assert.equal(stateFromChat(STATE_MARK + 'not json'), undefined)
  assert.equal(stateFromChat(STATE_MARK + '[1,2]'), undefined)
  assert.equal(stateFromChat(STATE_MARK + 'null'), undefined)
  assert.equal(stateFromChat('{"recording":true}'), undefined) // 표식 없음 = 일반 채팅
  assert.equal(stateFromChat(STATE_MARK + JSON.stringify({ x: 'a'.repeat(600) })), undefined) // 너무 큼
  assert.equal(STATE_MARK.charCodeAt(0), 0x2063) // 보이지 않는 구분 문자로 시작
})

test('홈 달력 기간 — 끝이 시작 뒤·45일 이하만', () => {
  const a = Date.UTC(2026, 9, 1)
  assert.equal(calRangeOk(a, a + 31 * 864e5, a), true)
  assert.equal(calRangeOk(a, a + CAL_SPAN_MAX_MS, a), true)
  assert.equal(calRangeOk(a, a + CAL_SPAN_MAX_MS + 1, a), false)
  assert.equal(calRangeOk(a, a, a), false)
  assert.equal(calRangeOk(NaN, a, a), false)
  // 화면 범위(지난 12달 ~ 앞 12달) 밖은 서버도 거절 — 종료 이력 전체 나열 방지
  assert.equal(calRangeOk(a - 365 * 864e5, a - 334 * 864e5, a), true)
  assert.equal(calRangeOk(a - 450 * 864e5, a - 420 * 864e5, a), false)
  assert.equal(calRangeOk(a + 420 * 864e5, a + 450 * 864e5, a), false)
})

test('지난 세미나 — 종료, 시작 지난 예정, 하루 넘은 진행 중', () => {
  const now = Date.UTC(2026, 9, 30)
  const iso = (ms) => new Date(ms).toISOString()
  assert.equal(smnPast('ENDED', iso(now + 864e5), now), true)
  assert.equal(smnPast('SCHEDULED', iso(now - 1000), now), true)
  assert.equal(smnPast('SCHEDULED', iso(now + 1000), now), false)
  assert.equal(smnPast('LIVE', iso(now - 3600e3), now), false)
  assert.equal(smnPast('LIVE', iso(now - 2 * 864e5), now), true)
})

test('방 관리 쪽 나눔 — 접속자 많은 순·같으면 ID 순, 12개씩, 미설정 종료 시각 null', () => {
  const room = (id, peers, end) => ({ id, cap: 31, peers, producers: 1, end })
  const rooms = Array.from({ length: 13 }, (_, i) => room(`r${String(i).padStart(2, '0')}`, 1))
  rooms.push(room('zz', 5, '2026-10-31T09:00:00Z'), room('aa', 5, '0001-01-01T00:00:00Z'))
  const p1 = roomPage(rooms, 1)
  assert.equal(p1.total, 15)
  assert.equal(p1.rows.length, 12)
  assert.deepEqual(p1.rows.slice(0, 3).map((r) => r.id), ['aa', 'zz', 'r00'])
  assert.equal(p1.rows[0].end, null) // Go 영(0) 시각
  assert.equal(p1.rows[1].end, '2026-10-31T09:00:00Z')
  assert.deepEqual(roomPage(rooms, 2).rows.map((r) => r.id), ['r10', 'r11', 'r12'])
  assert.equal(roomPage(rooms, 9).page, 2) // 넘친 쪽 = 마지막 쪽
  assert.deepEqual(roomPage([], 1), { rows: [], total: 0, page: 1 })
})

test('관리자 시간 관리 — 요금제별 남은 시간 합·늦은 만료, 이번 달 무료 미발급이면 1시간, 만료·미시작 제외', async () => {
  const { planTimes, monthStartUtc } = await import('./seminar-rules.ts')
  const now = Date.parse('2026-10-31T12:00:00Z')
  const mon = new Date(monthStartUtc(now)).toISOString()
  assert.equal(mon, '2026-10-01T00:00:00.000Z')
  const row = (plan_cd, grnt, use, strt, end, rsn) => ({ plan_cd, grnt_sec_cnt: grnt, use_sec_cnt: use, strt_dtm: strt, end_dtm: end, grnt_rsn_cd: rsn })
  // 아무 이용권 없음 = 무료 1시간(다음 달 초 만료)
  assert.deepEqual(planTimes([], now).FREE, { sec: 3600, endAt: '2026-11-01T00:00:00.000Z' })
  const t = planTimes(
    [
      row('FREE', 3600, 3000, mon, '2026-11-01T00:00:00Z', 'FREE'), // 이번 달 무료 발급됨 → 600
      row('FREE', 1800, 0, '2026-10-30T00:00:00Z', '2026-11-01T00:00:00Z', 'ADM'), // 관리자 연장 +1800
      row('M', 108000, 8000, '2026-10-05T00:00:00Z', '2026-11-05T00:00:00Z', 'PAY'),
      row('M', 3600, 0, '2026-10-31T00:00:00Z', '2026-11-05T00:00:00Z', 'ADM'),
      row('M', 108000, 0, '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z', 'PAY'), // 만료 — 제외
      row('Y', 1440000, 0, '2026-11-02T00:00:00Z', '2027-11-02T00:00:00Z', 'PAY'), // 미시작 — 제외
    ],
    now,
  )
  assert.deepEqual(t.FREE, { sec: 2400, endAt: '2026-11-01T00:00:00.000Z' })
  assert.deepEqual(t.M, { sec: 103600, endAt: '2026-11-05T00:00:00.000Z' })
  assert.deepEqual(t.Y, { sec: 0, endAt: null })
  // 늦게 끝나는 이용권이 소진(관리자 축소)되면 만료는 남은 이용권 기준
  const u = planTimes([row('M', 108000, 0, '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z', 'PAY'), row('M', 108000, 108000, '2026-10-15T00:00:00Z', '2026-11-15T00:00:00Z', 'PAY')], now)
  assert.deepEqual(u.M, { sec: 108000, endAt: '2026-11-01T00:00:00.000Z' })
})
