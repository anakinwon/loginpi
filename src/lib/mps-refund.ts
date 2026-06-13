import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'
import { sendA2U, isA2UEnabled } from './pi-a2u'

// MPS 취소 환불 오케스트레이션 (FR-10) — 멱등·gated.
// 구매자가 결제 완료(escrow_txid 보유) 주문을 취소했을 때만 환불 대상.
//   환불액 = 결제액 − 취소수수료(보증금 활성 거래만 0.1π, 무보증금 0π)
//   보증금 거래: 추가로 판매자에게 보상 0.1π A2U (피해 상대방 보상, §5-6 플랫폼 0π 원칙)
// 실 송금은 A2U(앱 지갑 → 사용자). 시드 미설정·송금 실패 시 PENDING 반환(주문+REFUND_IN 부재로 추적).

const FEE_PI = 0.1
const round7 = (n: number) => Math.round(n * 1e7) / 1e7

export type RefundResult =
  | { status: 'refunded'; amount: number; txid: string; sellerComp?: number }
  | {
      status: 'pending'
      amount: number
      reason: 'A2U_DISABLED' | 'A2U_FAILED'
      detail?: string
    }
  | {
      status: 'skipped'
      reason:
        | 'NOT_FOUND'
        | 'NOT_PAID'
        | 'NOT_BUYER_CANCEL'
        | 'ALREADY_REFUNDED'
        | 'NO_UID'
    }

interface OrderRow {
  order_id: string
  buyer_id: string
  seller_id: string
  order_st_cd: string
  order_price_pi: number
  escrow_txid: string | null
  cancel_req_id: string | null
}

export async function refundCancelledOrder(
  orderId: string,
  actorId: string,
): Promise<RefundResult> {
  const db = getSupabaseAdmin()

  const { data: orderData } = await db
    .from('mps_order')
    .select(
      'order_id, buyer_id, seller_id, order_st_cd, order_price_pi, escrow_txid, cancel_req_id',
    )
    .eq('order_id', orderId)
    .maybeSingle()
  if (!orderData) return { status: 'skipped', reason: 'NOT_FOUND' }
  const order = orderData as unknown as OrderRow

  // 결제 안 된 주문(에스크로 입금 없음)은 환불 대상 아님
  if (!order.escrow_txid) return { status: 'skipped', reason: 'NOT_PAID' }
  // 구매자 취소만 환불 (취소 상태 + 취소요청자 = 구매자)
  if (
    order.order_st_cd !== 'CANCELLED' ||
    order.cancel_req_id !== order.buyer_id
  )
    return { status: 'skipped', reason: 'NOT_BUYER_CANCEL' }

  // 멱등 — 이미 환불(REFUND_IN) 기록이 있으면 재송금 금지 (실거래 이중지급 방지)
  const { data: already } = await db
    .from('mps_txn_hist')
    .select('txn_id')
    .eq('order_id', orderId)
    .eq('txn_type_cd', 'REFUND_IN')
    .limit(1)
  if (already && already.length > 0)
    return { status: 'skipped', reason: 'ALREADY_REFUNDED' }

  // 취소수수료 적용 여부 — cancelOrder RPC가 보증금 활성 거래에만 남긴 FEE 행으로 판정
  const { data: feeRows } = await db
    .from('mps_txn_hist')
    .select('txn_id')
    .eq('order_id', orderId)
    .eq('txn_type_cd', 'FEE')
    .eq('user_id', order.buyer_id)
    .limit(1)
  const feeApplied = !!(feeRows && feeRows.length > 0)

  const price = Number(order.order_price_pi)
  const refundAmount = round7(feeApplied ? price - FEE_PI : price)

  // 구매자 Pi UID (A2U 수신자)
  const { data: buyer } = await db
    .from('sys_user')
    .select('pi_uid')
    .eq('id', order.buyer_id)
    .maybeSingle()
  const uid = (buyer as { pi_uid?: string } | null)?.pi_uid
  if (!uid) return { status: 'skipped', reason: 'NO_UID' }

  if (!isA2UEnabled())
    return { status: 'pending', amount: refundAmount, reason: 'A2U_DISABLED' }

  // 1) 구매자 환불 A2U
  let txid: string
  try {
    const res = await sendA2U({
      uid,
      amount: refundAmount,
      memo: 'MPS refund',
      metadata: {
        type: 'MPS_REFUND',
        order_id: orderId,
        fee_applied: feeApplied,
      },
    })
    txid = res.txid
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    console.error('[refund] 구매자 환불 A2U 실패:', orderId, detail)
    return {
      status: 'pending',
      amount: refundAmount,
      reason: 'A2U_FAILED',
      detail,
    }
  }

  // 송금은 이미 완료(txid 확정) — 장부 기록 실패 시에도 throw 금지(재시도 시 이중송금 방지).
  // 대신 txid를 CRITICAL 로그로 남겨 수동 복구 가능하게 한다.
  const { error: refundLogErr } = await db.from('mps_txn_hist').insert({
    order_id: orderId,
    user_id: order.buyer_id,
    txn_type_cd: 'REFUND_IN',
    pi_amt: refundAmount,
    pi_txid: txid,
    memo: feeApplied
      ? `구매자 취소 환불 (결제 ${price}π − 수수료 ${FEE_PI}π)`
      : `구매자 취소 환불 (전액 ${price}π)`,
    regr_id: actorId,
    modr_id: actorId,
  })
  if (refundLogErr)
    console.error(
      `[refund] CRITICAL 송금 성공했으나 장부기록 실패 — 수동기록 필요. order=${orderId} txid=${txid} amount=${refundAmount} err=${refundLogErr.message}`,
    )

  // 2) 보증금 거래면 판매자 보상 0.1π A2U (베스트 에포트 — 실패해도 구매자 환불은 확정)
  let sellerComp: number | undefined
  if (feeApplied) {
    const { data: seller } = await db
      .from('sys_user')
      .select('pi_uid')
      .eq('id', order.seller_id)
      .maybeSingle()
    const sellerUid = (seller as { pi_uid?: string } | null)?.pi_uid
    if (sellerUid) {
      try {
        const res = await sendA2U({
          uid: sellerUid,
          amount: FEE_PI,
          memo: 'MPS cancel comp',
          metadata: { type: 'MPS_CANCEL_COMP', order_id: orderId },
        })
        const { error: compErr } = await db.from('mps_txn_hist').insert({
          order_id: orderId,
          user_id: order.seller_id,
          txn_type_cd: 'CANCEL_FEE_IN',
          pi_amt: FEE_PI,
          pi_txid: res.txid,
          memo: '구매자 취소 보상 (취소수수료 수령)',
          regr_id: actorId,
          modr_id: actorId,
        })
        if (compErr)
          console.error(
            `[refund] CRITICAL 판매자 보상 송금 성공했으나 장부기록 실패 — 수동기록 필요. order=${orderId} txid=${res.txid} err=${compErr.message}`,
          )
        sellerComp = FEE_PI
      } catch (e) {
        console.error('[refund] 판매자 보상 A2U 실패(환불은 완료):', orderId, e)
      }
    }
  }

  return { status: 'refunded', amount: refundAmount, txid, sellerComp }
}
