// @pi/payments 순수 로직 시험 — 상태 전이·소수 금액 비교·검증기 배선. 실행 : pnpm --filter @pi/payments test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  amountEquals,
  canTransition,
  verifyPayment,
  type PiPaymentDTO,
  type Validators,
} from '../src/core.ts'

const pay = (over: Partial<PiPaymentDTO> = {}): PiPaymentDTO => ({
  identifier: 'p1',
  user_uid: 'uid-1',
  amount: 0.3,
  memo: 'm',
  metadata: { type: 'T', target_id: 'a' },
  from_address: '',
  to_address: '',
  direction: 'user_to_app',
  network: 'Pi Testnet',
  status: {
    developer_approved: false,
    transaction_verified: false,
    developer_completed: false,
    cancelled: false,
    user_cancelled: false,
  },
  transaction: null,
  created_at: '',
  ...over,
})
const user = { id: 'u1', pi_uid: 'uid-1' }
const okV: Validators = { T: () => ({ ok: true, amount: '0.1' }) }

test('상태 전이 — PENDING→APPROVED→COMPLETED|CANCELED 만', () => {
  assert.ok(canTransition('PENDING', 'APPROVED'))
  assert.ok(canTransition('APPROVED', 'COMPLETED'))
  assert.ok(canTransition('APPROVED', 'CANCELED'))
  assert.ok(!canTransition('PENDING', 'COMPLETED'))
  assert.ok(!canTransition('CANCELED', 'APPROVED'))
  assert.ok(!canTransition('COMPLETED', 'CANCELED'))
})

test('금액 비교 — 10^7 정수 단위', () => {
  assert.ok(amountEquals(0.1 + 0.2, 0.3)) // 부동소수 오차 흡수
  assert.ok(amountEquals('3.1415926', 3.1415926)) // NUMERIC 문자열
  assert.ok(!amountEquals(0.3000001, 0.3)) // 최소 단위 차이는 거부
  assert.ok(!amountEquals(0.31, 0.3)) // 초과도 거부
  assert.ok(!amountEquals('abc', 0))
})

test('검증기 배선 — 통과', async () => {
  let seen = ''
  const v: Validators = {
    T: ({ payment }) => {
      seen = String(payment.metadata.target_id)
      return { ok: true, amount: 0.3 }
    },
  }
  assert.deepEqual(await verifyPayment(pay(), user, v), { ok: true, type: 'T' })
  assert.equal(seen, 'a')
})

test('검증기 배선 — 거부 순서·Pi 취소 여부', async () => {
  // 타인 결제 : Pi 취소 안 함
  const other = await verifyPayment(pay({ user_uid: 'x' }), user, okV)
  assert.equal(other.ok || other.code, 'NOT_PAYER')
  assert.equal(other.ok || other.cancelPi, false)
  // pi_uid 없는 세션
  const noUid = await verifyPayment(pay(), { id: 'u1' }, okV)
  assert.equal(noUid.ok || noUid.code, 'NOT_PAYER')
  // 미등록 type·프로토타입 키
  for (const type of ['X', 'constructor', 1]) {
    const r = await verifyPayment(pay({ metadata: { type } }), user, okV)
    assert.equal(r.ok || r.code, 'META_INVALID')
    assert.equal(r.ok || r.cancelPi, true)
  }
  const a2u = await verifyPayment(pay({ direction: 'app_to_user' }), user, okV)
  assert.equal(a2u.ok || a2u.code, 'META_INVALID')
  // 클라이언트 금액(0.3) ≠ 서버 정가(0.1)
  const amt = await verifyPayment(pay(), user, okV)
  assert.equal(amt.ok || amt.code, 'AMOUNT_MISMATCH')
  // 앱 고유 코드·상태 전달
  const app = await verifyPayment(pay(), user, {
    T: () => ({ ok: false, code: 'SEAT_FULL', status: 410 }),
  })
  assert.equal(app.ok || `${app.code}/${app.status}`, 'SEAT_FULL/410')
  // 검증기 예외 : 500, Pi 결제는 남김
  const boom = await verifyPayment(pay(), user, {
    T: async () => {
      throw new Error('db down')
    },
  })
  assert.equal(
    boom.ok || `${boom.code}/${boom.cancelPi}/${boom.detail}`,
    'DB_FAILED/false/db down',
  )
})
