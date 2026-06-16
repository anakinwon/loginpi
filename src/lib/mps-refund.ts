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
  cancelRole?: 'BUYER' | 'SELLER' | null, // 취소 화면 역할 — self-purchase(buyer=seller) 구분용
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
  // 취소된 주문만 환불 (취소 주체 무관 — 구매자·판매자·관리자 취소 모두 구매자에게 환불)
  if (order.order_st_cd !== 'CANCELLED')
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

  // 취소수수료 적용 주체 판정 — cancelOrder RPC가 보증금 활성 거래에만 남긴 FEE 행으로 구분.
  //   buyer FEE 존재  = 구매자 취소(보증금 거래) → 구매자 환불에서 0.1 공제 + 판매자에게 0.1 보상
  //   seller FEE 존재 = 판매자 취소(보증금 거래) → 구매자에게 0.1 보상 가산(판매자 보증금에서 충당)
  const { data: feeRows } = await db
    .from('mps_txn_hist')
    .select('user_id')
    .eq('order_id', orderId)
    .eq('txn_type_cd', 'FEE')
  const feeApplied = !!feeRows && feeRows.length > 0

  // 취소 당사자 판정 — 명시적 역할(cancelRole)이 있으면 우선 사용.
  // self-purchase(buyer=seller)는 id 추론이 무너지므로 역할이 필수. 없으면 id 추론 폴백.
  let feeBuyer: boolean
  let feeSeller: boolean
  if (cancelRole) {
    feeBuyer = feeApplied && cancelRole === 'BUYER'
    feeSeller = feeApplied && cancelRole === 'SELLER'
  } else {
    feeBuyer = !!feeRows?.some((r) => r.user_id === order.buyer_id)
    feeSeller = !!feeRows?.some((r) => r.user_id === order.seller_id)
  }

  const price = Number(order.order_price_pi)
  // 통합 환불 공식: 결제액 − 구매자수수료 + 판매자수수료
  //   구매자 취소(보증금): price − 0.1 / 판매자 취소(보증금): price + 0.1 / 무보증금·관리자: price
  const refundAmount = round7(
    price - (feeBuyer ? FEE_PI : 0) + (feeSeller ? FEE_PI : 0),
  )

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
        fee_buyer: feeBuyer,
        fee_seller: feeSeller,
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
    memo: feeBuyer
      ? `구매자 취소 환불 (결제 ${price}π − 수수료 ${FEE_PI}π)`
      : feeSeller
        ? `판매자 취소 환불 (결제 ${price}π + 보상 ${FEE_PI}π)`
        : `취소 환불 (전액 ${price}π)`,
    regr_id: actorId,
    modr_id: actorId,
  })
  if (refundLogErr)
    console.error(
      `[refund] CRITICAL 송금 성공했으나 장부기록 실패 — 수동기록 필요. order=${orderId} txid=${txid} amount=${refundAmount} err=${refundLogErr.message}`,
    )

  // 구매자 취소 시: 공제된 0.1π는 판매자에게 송금하지 않고 플랫폼에 귀속(미송금).
  //   (구매자 1.0 − 수수료 0.1 = 0.9π만 환불, 추가 송금 없음)
  // 판매자 취소 시(feeSeller): 0.1π는 이미 구매자 환불액(1.1)에 가산되어 처리됨.
  return { status: 'refunded', amount: refundAmount, txid }
}
