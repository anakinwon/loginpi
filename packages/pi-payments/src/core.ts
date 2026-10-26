// @pi/payments 순수 로직 — 원장 상태 전이·금액 비교(10^7 정수 단위)·앱 검증기 배선(verifyPayment).
//  외부 의존·server-only 없음 → `pnpm --filter @pi/payments test`(node:test)로 직접 시험한다.
//  순서 철칙(sitemap.pi approve 승계) : 결제자 → 방향 → metadata 검증기 → 취소 여부 → 정가 일치. Pi approve 는 이 검증·원장 기록 뒤에만

// Pi Platform PaymentDTO(서버 응답) — 전역 PaymentDTO(앱 types/pi-network.d.ts)에 기대지 않도록 패키지 자체 정의
export interface PiPaymentDTO {
  identifier: string
  user_uid: string
  amount: number
  memo: string
  metadata: Record<string, unknown>
  from_address: string
  to_address: string
  direction: 'user_to_app' | 'app_to_user'
  network: string
  status: {
    developer_approved: boolean
    transaction_verified: boolean
    developer_completed: boolean
    cancelled: boolean
    user_cancelled: boolean
  }
  transaction: { txid: string; verified: boolean; _link: string } | null
  created_at: string
}

// 원장 상태 — PENDING = 원장 행 없음(Pi createPayment 직후). DB CHECK 은 3값만(packages/pi-db/sql/010_pi_pymnt.sql)
export type PymntSts = 'APPROVED' | 'COMPLETED' | 'CANCELED'
export type PymntState = PymntSts | 'PENDING'

const NEXT_STS: Record<PymntState, readonly PymntSts[]> = {
  PENDING: ['APPROVED'],
  APPROVED: ['COMPLETED', 'CANCELED'],
  COMPLETED: [],
  CANCELED: [],
}

export const canTransition = (from: PymntState, to: PymntSts) =>
  NEXT_STS[from].includes(to)

// 1 Pi = 10^7 단위(pi_amt NUMERIC(18,7)) — 부동소수 오차 없이 정수로 비교
export const PI_UNIT = 10_000_000
export const toUnits = (amt: number | string) =>
  Math.round(Number(amt) * PI_UNIT)

// 정가(b)와 정확히 일치(초과도 거부) — 숫자·비어 있지 않은 숫자 문자열만, 정가는 0 초과
//  Number('')·Number(null) = 0 이라 형식부터 거른다
const isAmt = (v: unknown): v is number | string =>
  (typeof v === 'number' && Number.isFinite(v)) ||
  (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)))
export const amountEquals = (a: number | string, b: number | string) => {
  if (!isAmt(a) || !isAmt(b)) return false
  const y = toUnits(b)
  return y > 0 && toUnits(a) === y
}

// 실패 코드 — 앱이 자기 apiError 코드로 옮긴다(README 매핑 표). 검증기 고유 코드도 허용
export type PayCode =
  | 'SERVER_CONFIG' // PI_API_KEY 미설정
  | 'PI_API_FAILED' // Pi API 실패·타임아웃
  | 'NOT_PAYER' // 결제자 ≠ 세션 사용자(Pi cancel 하지 않음 — 타인 결제)
  | 'META_INVALID' // 방향·metadata.type 미등록
  | 'PAYMENT_CANCELLED' // Pi 측 이미 취소
  | 'AMOUNT_MISMATCH' // 서버 정가와 불일치
  | 'ALREADY_PAID'
  | 'INVALID_STATE'
  | 'NOT_FOUND'
  | 'TXID_MISMATCH'
  | 'PI_CANCEL_REFUSED' // 서명 뒤 거래 진행 중 — 원장 APPROVED 유지, complete 복구가 마무리
  | 'DB_FAILED'
  | (string & {})

export interface PayFail {
  ok: false
  code: PayCode
  status: number
  detail?: string // 서버 로그용 — 클라이언트에 그대로 내보내지 말 것
}

export interface PayUser {
  id: string // sys_user.usr_id
  pi_uid?: string | null // 세션의 Pi uid(결제자 대조)
}

// 앱 검증기 — metadata.type 1종당 1개. 서버가 정가를 재계산해 amount 로 돌려준다(클라이언트 금액 신뢰 금지)
//  이중 결제 확인(hasOtherApprovedPayment)·대상 상태 확인도 여기서 한다
export type ValidateResult =
  | { ok: true; amount: number | string }
  | { ok: false; code: PayCode; status?: number }
export type PaymentValidator = (ctx: {
  payment: PiPaymentDTO
  user: PayUser
}) => Promise<ValidateResult> | ValidateResult
export type Validators = Record<string, PaymentValidator>

// cancelPi = 거부 시 Pi 측 결제도 취소할지(타인 결제·일시 오류는 false)
export type VerifyResult =
  | { ok: true; type: string }
  | (PayFail & { cancelPi: boolean })

export async function verifyPayment(
  payment: PiPaymentDTO,
  user: PayUser,
  validators: Validators,
): Promise<VerifyResult> {
  const fail = (code: PayCode, status: number, cancelPi = true) =>
    ({ ok: false, code, status, cancelPi }) as const
  // 결제자 먼저 — 타인 paymentId 로 남의 결제를 취소시키지 못하게(sitemap.pi 는 metadata 뒤였음)
  if (!user.pi_uid || payment.user_uid !== user.pi_uid)
    return fail('NOT_PAYER', 403, false)
  if (payment.direction !== 'user_to_app') return fail('META_INVALID', 400)
  const type = payment.metadata?.type
  // hasOwn — 'constructor' 같은 프로토타입 키를 검증기로 오인하지 않게
  if (typeof type !== 'string' || !Object.hasOwn(validators, type))
    return fail('META_INVALID', 400)
  if (payment.status.cancelled || payment.status.user_cancelled)
    return fail('PAYMENT_CANCELLED', 409)
  let r: ValidateResult
  try {
    r = await validators[type]({ payment, user })
  } catch (e) {
    // 검증기 예외(DB 오류 등) — 일시 오류일 수 있어 Pi 결제는 남겨 재시도 가능하게
    return {
      ...fail('DB_FAILED', 500, false),
      detail: e instanceof Error ? e.message : String(e),
    }
  }
  if (!r.ok) return fail(r.code, r.status ?? 409)
  if (!amountEquals(payment.amount, r.amount))
    return fail('AMOUNT_MISMATCH', 400)
  return { ok: true, type }
}
