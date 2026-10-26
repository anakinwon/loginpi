// 결제 흐름 3종 — 앱의 /api/payments/{approve,complete,cancel} 라우트가 세션 확인 뒤 호출한다(NextResponse 무관, 결과 객체 반환).
//  approve  : Pi GET → verifyPayment(결제자·방향·검증기 정가) → 원장 APPROVED → Pi approve(실패 시 Pi cancel + 원장 CANCELED)
//  complete : 원장 선조회(본인·APPROVED) → Pi complete → txid 대조 → finalize(앱 RPC) 또는 원장 COMPLETED
//  cancel   : 본인 APPROVED 만, Pi cancel 성공 시에만 CANCELED. 원장 없으면 Pi 결제자 확인 뒤 Pi cancel(IDOR 차단)
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  canTransition,
  verifyPayment,
  type PayCode,
  type PayFail,
  type PayUser,
  type PiPaymentDTO,
  type Validators,
} from './core'
import {
  approvePiPayment,
  cancelPiPayment,
  completePiPayment,
  getPiPayment,
  type PiApiResult,
} from './pi-api'
import {
  getOwnPayment,
  insertApprovedPayment,
  markPaymentCanceled,
  markPaymentCompleted,
  type PymntRow,
} from './ledger'

export interface FlowInput {
  db: SupabaseClient
  user: PayUser // 앱이 getSessionUser 로 확인한 사용자(null 이면 호출 전에 401)
  paymentId: string
}

const fail = (code: PayCode, status: number, detail?: string): PayFail => ({
  ok: false,
  code,
  status,
  ...(detail && { detail }),
})
const piFail = (r: Extract<PiApiResult, { ok: false }>) =>
  r.noKey
    ? fail('SERVER_CONFIG', 500)
    : fail('PI_API_FAILED', 502, `${r.status} ${r.body.slice(0, 300)}`)
const dbErr = (e: unknown) =>
  fail(
    'DB_FAILED',
    500,
    e instanceof Error ? e.message : (e as { message?: string })?.message,
  )
// best-effort Pi 취소 — 남으면 다음 createPayment 가 거부될 수 있다
const cancelQuietly = (id: string) => cancelPiPayment(id).catch(() => undefined)

export async function approvePayment(
  input: FlowInput & { validators: Validators },
): Promise<{ ok: true; paymentId: string; type: string } | PayFail> {
  const { db, user, paymentId, validators } = input
  // 1) 조회 — 승인 전이라 지갑 변동 없음
  const got = await getPiPayment(paymentId)
  if (!got.ok) return piFail(got)
  const payment = got.payment

  // 2) 검증(서버 정가 재계산)
  const v = await verifyPayment(payment, user, validators)
  if (!v.ok) {
    if (v.cancelPi) await cancelQuietly(payment.identifier)
    return fail(v.code, v.status, v.detail)
  }

  // 3) 원장 APPROVED — Pi approve 보다 먼저
  let ins
  try {
    ins = await insertApprovedPayment(db, payment, user.id, v.type)
  } catch (e) {
    return dbErr(e)
  }
  if (!ins.inserted) {
    const row = ins.row
    if (!row || row.usr_id !== user.id) return fail('NOT_PAYER', 403)
    if (row.pymnt_sts_cd === 'COMPLETED') return fail('ALREADY_PAID', 409)
    if (row.pymnt_sts_cd !== 'APPROVED') {
      // CANCELED 원장은 되살리지 않는다(canTransition CANCELED→APPROVED 불가)
      await cancelQuietly(payment.identifier)
      return fail('INVALID_STATE', 409)
    }
    // APPROVED 재호출 — 아래 Pi approve 를 다시 시도(already_approved 멱등)
  }

  // 4) Pi approve — 실패 시 Pi cancel + 원장 CANCELED(좀비 APPROVED 방지)
  const r = await approvePiPayment(payment.identifier)
  if (!r.ok && r.error !== 'already_approved') {
    console.error(
      '[pi-payments/approve] Pi approve',
      r.status,
      r.body.slice(0, 300),
    )
    await cancelQuietly(payment.identifier)
    await markPaymentCanceled(db, payment.identifier, user.id)
    return piFail(r)
  }
  return { ok: true, paymentId: payment.identifier, type: v.type }
}

// finalize : 원장 COMPLETED 와 도메인 반영을 한 트랜잭션으로 하는 앱 RPC(예: sitemap.pi fn_cmpl_site_reg_pymnt).
//  주면 원장 갱신도 finalize 책임, 안 주면 markPaymentCompleted 만 한다. 재호출 멱등이어야 한다
export type Finalize<R> = (ctx: {
  row: PymntRow
  payment: PiPaymentDTO
  txid: string
}) => Promise<R>

export async function completePayment<R = void>(
  input: FlowInput & { txid: string; finalize?: Finalize<R> },
): Promise<{ ok: true; row: PymntRow; result?: R; already?: true } | PayFail> {
  const { db, user, paymentId, txid, finalize } = input
  // 1) 원장 선조회 — approve 가 기록한 본인 결제만(타인 paymentId·txid 재생 차단, 원장 없으면 Pi 호출 없음)
  let row
  try {
    row = await getOwnPayment(db, paymentId, user.id)
  } catch (e) {
    return dbErr(e)
  }
  if (!row) return fail('NOT_FOUND', 409)
  if (row.pymnt_sts_cd === 'COMPLETED')
    return row.tx_id === txid
      ? { ok: true, row, already: true }
      : fail('TXID_MISMATCH', 409)
  if (!canTransition(row.pymnt_sts_cd, 'COMPLETED'))
    return fail('INVALID_STATE', 409)

  // 2) Pi complete — 이미 완료된 결제의 재호출은 오류 본문의 결제 객체로 판정
  const r = await completePiPayment(paymentId, txid)
  const payment = r.ok
    ? r.payment
    : r.payment?.status.developer_completed
      ? r.payment
      : null
  if (!payment) {
    if (!r.ok)
      console.error(
        '[pi-payments/complete] Pi complete',
        r.status,
        r.body.slice(0, 300),
      )
    return r.ok ? fail('PI_API_FAILED', 502) : piFail(r)
  }
  // 3) txid 대조 — Pi 가 기록한 거래와 요청 txid 가 같아야 한다
  if (payment.transaction?.txid !== txid) return fail('TXID_MISMATCH', 409)

  // 4) 원장 COMPLETED(+ 도메인 반영)
  try {
    if (finalize)
      return { ok: true, row, result: await finalize({ row, payment, txid }) }
    await markPaymentCompleted(db, paymentId, user.id, txid)
    return { ok: true, row }
  } catch (e) {
    console.error('[pi-payments/complete] finalize', paymentId, e)
    return dbErr(e)
  }
}

export async function cancelPayment(
  input: FlowInput,
): Promise<{ ok: true; status: 'NONE' | 'CANCELED' } | PayFail> {
  const { db, user, paymentId } = input
  let row
  try {
    row = await getOwnPayment(db, paymentId, user.id)
  } catch (e) {
    return dbErr(e)
  }
  if (!row) {
    // 원장 없음(approve 전 취소) — Pi 결제자가 본인일 때만 정리. 아니면 존재 자체를 숨김
    const got = await getPiPayment(paymentId)
    if (!got.ok || !user.pi_uid || got.payment.user_uid !== user.pi_uid)
      return fail('NOT_FOUND', 404)
    await cancelQuietly(paymentId)
    return { ok: true, status: 'NONE' }
  }
  if (row.pymnt_sts_cd === 'COMPLETED') return fail('ALREADY_PAID', 409)
  if (row.pymnt_sts_cd === 'CANCELED') {
    await cancelQuietly(paymentId)
    return { ok: true, status: 'CANCELED' }
  }
  const r = await cancelPiPayment(paymentId)
  if (!r.ok) {
    // 서명 뒤 거래 진행 중 — 원장을 CANCELED 로 바꾸면 "돈은 나갔는데 기록 없음"이 된다. APPROVED 유지
    console.error(
      '[pi-payments/cancel] Pi cancel',
      r.status,
      r.body.slice(0, 300),
    )
    return fail('PI_CANCEL_REFUSED', 409)
  }
  await markPaymentCanceled(db, paymentId, user.id)
  return { ok: true, status: 'CANCELED' }
}
