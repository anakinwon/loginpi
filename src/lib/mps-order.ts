import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

// MPS 주문 — 상태 머신 (에스크로 결제 즉시 거래중):
//   PENDING → TRADING(결제 완료 = 거래중) → BUYER_DONE(구매자 수령) → DONE(판매자 거래완료 → 정산)
// ESCROW·SELLER_DONE은 구버전 주문 호환용 레거시 상태 — 신규 전환 없음
// 생성·취소는 재고 원자성 때문에 DB RPC(fn_mps_order_create / fn_mps_order_cancel) 위임

export interface MpsOrder {
  order_id: string
  item_id: string
  buyer_id: string
  seller_id: string
  order_price_pi: number
  order_st_cd:
    | 'PENDING'
    | 'ESCROW'
    | 'TRADING'
    | 'SELLER_DONE'
    | 'BUYER_DONE'
    | 'DONE'
    | 'CANCELLED'
  escrow_txid: string | null
  release_txid: string | null
  cancel_req_id: string | null
  cancel_reason: string | null
  meet_loc_desc: string | null
  reg_dtm: string
  mod_dtm: string
}

export type OrderError =
  | 'OUT_OF_STOCK'
  | 'SELF_PURCHASE'
  | 'ORDER_NOT_FOUND'
  | 'NOT_ALLOWED'
  | 'UNKNOWN'

function mapRpcError(message: string): OrderError {
  for (const code of [
    'OUT_OF_STOCK',
    'SELF_PURCHASE',
    'ORDER_NOT_FOUND',
    'NOT_ALLOWED',
  ] as const) {
    if (message.includes(code)) return code
  }
  return 'UNKNOWN'
}

// 주문 생성 — 재고 원자적 차감 + PENDING (RPC 단일 트랜잭션)
export async function createOrder(
  itemId: string,
  buyerId: string,
  meetLoc: string | null,
  regrId: string,
): Promise<{ order: MpsOrder } | { error: OrderError }> {
  const { data, error } = await getSupabaseAdmin().rpc('fn_mps_order_create', {
    p_item_id: itemId,
    p_buyer_id: buyerId,
    p_meet_loc: meetLoc,
    p_regr_id: regrId,
  })
  if (error) return { error: mapRpcError(error.message) }
  return { order: data as MpsOrder }
}

// 주문 취소 — 상태·권한 검증 + 재고 복원 (RPC 단일 트랜잭션)
export async function cancelOrder(
  orderId: string,
  userId: string,
  reason: string,
  isAdminUser: boolean,
): Promise<{ order: MpsOrder } | { error: OrderError }> {
  const { data, error } = await getSupabaseAdmin().rpc('fn_mps_order_cancel', {
    p_order_id: orderId,
    p_cancel_req_id: userId,
    p_reason: reason,
    p_is_admin: isAdminUser,
  })
  if (error) return { error: mapRpcError(error.message) }
  return { order: data as MpsOrder }
}

// 에스크로 입금 완료 — Pi 결제 complete 콜백에서 호출 (PENDING → TRADING, 구매자·금액 검증은 호출자 책임)
export async function markEscrow(
  orderId: string,
  buyerId: string,
  txid: string,
  amountPi: number,
) {
  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('mps_order')
    .update({
      order_st_cd: 'TRADING',
      escrow_txid: txid,
      modr_id: buyerId,
      mod_dtm: new Date().toISOString(),
    })
    .eq('order_id', orderId)
    .eq('buyer_id', buyerId)
    .eq('order_st_cd', 'PENDING') // 상태 가드 — 중복 콜백·경합 안전
    .eq('del_yn', 'N')
    .select()
    .maybeSingle()

  if (error || !data) return null

  await db.from('mps_txn_hist').insert({
    order_id: orderId,
    user_id: buyerId,
    txn_type_cd: 'ESCROW_IN',
    pi_amt: amountPi,
    pi_txid: txid,
    memo: '구매자 → 에스크로 입금',
    regr_id: buyerId,
    modr_id: buyerId,
  })
  return data as MpsOrder
}

// ① 구매자 "물건 수령 완료" — TRADING → BUYER_DONE (판매자 거래완료 대기)
//    ESCROW·SELLER_DONE은 구버전 주문 호환 허용
export async function markBuyerDone(orderId: string, buyerId: string) {
  const { data } = await getSupabaseAdmin()
    .from('mps_order')
    .update({
      order_st_cd: 'BUYER_DONE',
      modr_id: buyerId,
      mod_dtm: new Date().toISOString(),
    })
    .eq('order_id', orderId)
    .eq('buyer_id', buyerId)
    .in('order_st_cd', ['TRADING', 'ESCROW', 'SELLER_DONE'])
    .eq('del_yn', 'N')
    .select()
    .maybeSingle()

  return (data as MpsOrder | null) ?? null
}

// ② 판매자 "거래 완료" — BUYER_DONE → DONE + RELEASE_OUT 이력 (에스크로 → 판매자, 실 Pi 정산은 운영자 처리)
export async function markComplete(orderId: string, sellerId: string) {
  const db = getSupabaseAdmin()
  const { data } = await db
    .from('mps_order')
    .update({
      order_st_cd: 'DONE',
      modr_id: sellerId,
      mod_dtm: new Date().toISOString(),
    })
    .eq('order_id', orderId)
    .eq('seller_id', sellerId)
    .eq('order_st_cd', 'BUYER_DONE') // 단계 순서 강제 — 구매자 수령 확인 전 거래 종결 불가
    .eq('del_yn', 'N')
    .select()
    .maybeSingle()

  if (!data) return null
  const order = data as MpsOrder

  await db.from('mps_txn_hist').insert({
    order_id: orderId,
    user_id: order.seller_id,
    txn_type_cd: 'RELEASE_OUT',
    pi_amt: -order.order_price_pi,
    memo: '판매자 정산 대기 — 운영자 에스크로 계정에서 송금 처리 필요',
    regr_id: sellerId,
    modr_id: sellerId,
  })
  return order
}

// 주문 상세 — 당사자(구매자·판매자)·관리자만
export async function getOrderForUser(
  orderId: string,
  userId: string,
  isAdminUser: boolean,
) {
  const { data } = await getSupabaseAdmin()
    .from('mps_order')
    .select('*, mps_item ( item_nm, thumbnail_url, price_pi )')
    .eq('order_id', orderId)
    .eq('del_yn', 'N')
    .maybeSingle()

  if (!data) return { error: 'NOT_FOUND' as const }
  const order = data as MpsOrder & { mps_item: unknown }
  if (!isAdminUser && order.buyer_id !== userId && order.seller_id !== userId) {
    return { error: 'FORBIDDEN' as const }
  }
  return { order }
}

// 내 주문 목록 — role: buyer(구매) | seller(판매)
// mps_shop 위치 필드(place_id·좌표·주소)를 포함해 클라이언트가 네비게이션 딥링크를 생성할 수 있게 한다
export async function listOrdersByRole(
  userId: string,
  role: 'buyer' | 'seller',
) {
  const column = role === 'buyer' ? 'buyer_id' : 'seller_id'
  const { data, error } = await getSupabaseAdmin()
    .from('mps_order')
    .select(
      '*, mps_item ( item_nm, thumbnail_url, mps_shop ( shop_nm, addr, latd_crd, lngt_crd, place_id ) )',
    )
    .eq(column, userId)
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })

  if (error) throw new Error(error.message)
  return data ?? []
}

// 거래 이력 — FR-12
export async function listTxnHistory(userId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('mps_txn_hist')
    .select('*')
    .eq('user_id', userId)
    .eq('del_yn', 'N')
    .order('txn_dtm', { ascending: false })

  if (error) throw new Error(error.message)
  return data ?? []
}
