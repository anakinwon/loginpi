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
  // 주문 시점 자국통화 스냅샷(판매이력) — item에서 복사. ccy_cd NULL = Pi 직접거래
  ccy_cd: string | null
  ccy_amt: number | null
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
  | 'EMPTY_CART'
  | 'SHOP_NOT_FOUND'
  | 'BAD_QTY'
  | 'UNKNOWN'

function mapRpcError(message: string): OrderError {
  for (const code of [
    'OUT_OF_STOCK',
    'SELF_PURCHASE',
    'ORDER_NOT_FOUND',
    'NOT_ALLOWED',
    'EMPTY_CART',
    'SHOP_NOT_FOUND',
    'BAD_QTY',
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
  orderMthd?: 'DINE_IN' | 'PICKUP' | 'DELIVERY' | null,
  dlvrAddr?: string | null,
  allowSelf = false, // 관리자 본인상품 테스트 결제 허용 (기본 차단)
): Promise<{ order: MpsOrder } | { error: OrderError }> {
  const { data, error } = await getSupabaseAdmin().rpc('fn_mps_order_create', {
    p_item_id: itemId,
    p_buyer_id: buyerId,
    p_meet_loc: meetLoc,
    p_regr_id: regrId,
    p_allow_self: allowSelf,
  })
  if (error) return { error: mapRpcError(error.message) }
  const order = data as MpsOrder

  // 자국통화 스냅샷 — 주문 시점 item 통화값을 주문에 복사(판매이력 보존, 등록시점 고정 참고가)
  const { data: itemCcy } = await getSupabaseAdmin()
    .from('mps_item')
    .select('ccy_cd, ccy_amt')
    .eq('item_id', itemId)
    .maybeSingle()
  const ccy = itemCcy as { ccy_cd: string | null; ccy_amt: number | null } | null

  // 주문방법·배달주소(RPC는 재고 원자성만 담당) + 통화 스냅샷을 단일 사후 UPDATE로 반영
  const patch: Record<string, unknown> = { modr_id: regrId }
  if (ccy?.ccy_cd) {
    patch.ccy_cd = ccy.ccy_cd
    patch.ccy_amt = ccy.ccy_amt
  }
  if (orderMthd) {
    patch.order_mthd_cd = orderMthd
    patch.dlvr_addr = orderMthd === 'DELIVERY' ? (dlvrAddr ?? null) : null
  }

  if (ccy?.ccy_cd || orderMthd) {
    const { data: updated } = await getSupabaseAdmin()
      .from('mps_order')
      .update(patch)
      .eq('order_id', order.order_id)
      .select('*')
      .single()
    if (updated) return { order: updated as MpsOrder }
  }
  return { order }
}

// 카트 다중라인 주문 생성 — 라인별 원자적 재고차감 + 헤더/라인(단일 트랜잭션, RPC) (FR-14)
export interface CartLineInput {
  item_id: string
  qty: number
}
export async function createCartOrder(
  shopId: string,
  items: CartLineInput[],
  buyerId: string,
  regrId: string,
  orderMthd: 'DINE_IN' | 'PICKUP' | 'DELIVERY' = 'DINE_IN',
  dlvrAddr: string | null = null,
  allowSelf = false,
): Promise<{ order: MpsOrder } | { error: OrderError; detail?: string }> {
  const { data, error } = await getSupabaseAdmin().rpc(
    'fn_mps_cart_order_create',
    {
      p_shop_id: shopId,
      p_buyer_id: buyerId,
      p_items: items,
      p_regr_id: regrId,
      p_order_mthd: orderMthd,
      p_dlvr_addr: dlvrAddr,
      p_allow_self: allowSelf,
    },
  )
  if (error) {
    console.error('[cart order] RPC error:', error.message)
    return { error: mapRpcError(error.message), detail: error.message }
  }
  return { order: data as MpsOrder }
}

// 카트 주문 롤백 — 결제 미완료(PENDING) 라인 전체 재고 복원 + CANCELLED (RPC)
export async function cancelCartOrder(
  orderId: string,
  userId: string,
  reason: string | null,
  regrId: string,
): Promise<{ order: MpsOrder } | { error: OrderError }> {
  const { data, error } = await getSupabaseAdmin().rpc(
    'fn_mps_cart_order_cancel',
    {
      p_order_id: orderId,
      p_user_id: userId,
      p_reason: reason,
      p_regr_id: regrId,
    },
  )
  if (error) return { error: mapRpcError(error.message) }
  return { order: data as MpsOrder }
}

// 주문 취소 — 상태·권한 검증 + 재고 복원 (RPC 단일 트랜잭션)
export async function cancelOrder(
  orderId: string,
  userId: string,
  reason: string,
  isAdminUser: boolean,
  cancelRole?: 'BUYER' | 'SELLER' | null, // 취소 화면 역할 — self-purchase 구분용
): Promise<{ order: MpsOrder } | { error: OrderError }> {
  const { data, error } = await getSupabaseAdmin().rpc('fn_mps_order_cancel', {
    p_order_id: orderId,
    p_cancel_req_id: userId,
    p_reason: reason,
    p_is_admin: isAdminUser,
    p_cancel_role: cancelRole ?? null,
  })
  if (error) return { error: mapRpcError(error.message) }
  return { order: data as MpsOrder }
}

// 에스크로 입금 완료 — Pi 결제 complete 콜백에서 호출 (구매자·금액 검증은 호출자 책임)
//   오프라인(매장 소속 상품) 주문 → ORDERED(상품주문중) / 직거래 → TRADING(거래중)
export async function markEscrow(
  orderId: string,
  buyerId: string,
  txid: string,
  amountPi: number,
) {
  const db = getSupabaseAdmin()

  // 오프라인 여부 판정 — 주문 상품이 매장 소속(shop_id 존재)이면 오프라인 흐름.
  // PostgREST 중첩 응답이 객체/배열 둘 다 올 수 있어 양쪽 모두 대응 (배열이면 [0])
  const { data: ord } = await db
    .from('mps_order')
    .select('ccy_cd, ccy_amt, mps_item(shop_id)')
    .eq('order_id', orderId)
    .maybeSingle()
  const ordRow = ord as {
    ccy_cd?: string | null
    ccy_amt?: number | null
    mps_item?: unknown
  } | null
  const rawItem = ordRow?.mps_item
  const itemObj = Array.isArray(rawItem) ? rawItem[0] : rawItem
  const isOffline = !!(itemObj as { shop_id?: string | null } | null)?.shop_id
  const nextState = isOffline ? 'ORDERED' : 'TRADING'

  const { data, error } = await db
    .from('mps_order')
    .update({
      order_st_cd: nextState,
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
    // 자국통화 참고가 스냅샷 — 입금이므로 부호 +(pi_amt 부호 일치)
    ccy_cd: ordRow?.ccy_cd ?? null,
    ccy_amt: ordRow?.ccy_amt ?? null,
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
    // 자국통화 참고가 스냅샷 — 출금이므로 부호 −(pi_amt 부호 일치)
    ccy_cd: order.ccy_cd ?? null,
    ccy_amt: order.ccy_amt != null ? -Number(order.ccy_amt) : null,
    memo: '판매자 정산 대기 — 운영자 에스크로 계정에서 송금 처리 필요',
    regr_id: sellerId,
    modr_id: sellerId,
  })
  return order
}

// ──────────────────────────────────────────────────────────────
// 오프라인 매장 주문 흐름 — ORDERED → PREPARING → READY → DONE
// ──────────────────────────────────────────────────────────────

// 판매자 "접수" — ORDERED → PREPARING (상품준비중)
export async function markPreparing(orderId: string, sellerId: string) {
  const { data } = await getSupabaseAdmin()
    .from('mps_order')
    .update({
      order_st_cd: 'PREPARING',
      modr_id: sellerId,
      mod_dtm: new Date().toISOString(),
    })
    .eq('order_id', orderId)
    .eq('seller_id', sellerId)
    .eq('order_st_cd', 'ORDERED') // 단계 강제 — 주문중에서만 접수
    .eq('del_yn', 'N')
    .select()
    .maybeSingle()
  return (data as MpsOrder | null) ?? null
}

// 판매자 "준비완료" — PREPARING → READY (상품준비완료, 10분 자동완료 타이머 시작)
export async function markReady(orderId: string, sellerId: string) {
  const now = new Date().toISOString()
  const { data } = await getSupabaseAdmin()
    .from('mps_order')
    .update({
      order_st_cd: 'READY',
      ready_dtm: now, // 자동완료 기준 시각
      modr_id: sellerId,
      mod_dtm: now,
    })
    .eq('order_id', orderId)
    .eq('seller_id', sellerId)
    .eq('order_st_cd', 'PREPARING') // 단계 강제 — 준비중에서만 준비완료
    .eq('del_yn', 'N')
    .select()
    .maybeSingle()
  return (data as MpsOrder | null) ?? null
}

// 정산 이력 INSERT (RELEASE_OUT) — markComplete·markPickup·자동완료 공용
async function insertReleaseOut(
  db: ReturnType<typeof getSupabaseAdmin>,
  order: MpsOrder,
  actorId: string,
) {
  await db.from('mps_txn_hist').insert({
    order_id: order.order_id,
    user_id: order.seller_id,
    txn_type_cd: 'RELEASE_OUT',
    pi_amt: -order.order_price_pi,
    // 자국통화 참고가 스냅샷 — 출금이므로 부호 −(pi_amt 부호 일치)
    ccy_cd: order.ccy_cd ?? null,
    ccy_amt: order.ccy_amt != null ? -Number(order.ccy_amt) : null,
    memo: '판매자 정산 대기 — 운영자 에스크로 계정에서 송금 처리 필요',
    regr_id: actorId,
    modr_id: actorId,
  })
}

// 구매자 "픽업" — READY → DONE + 정산 (구매자 액션)
export async function markPickup(orderId: string, buyerId: string) {
  const db = getSupabaseAdmin()
  const { data } = await db
    .from('mps_order')
    .update({
      order_st_cd: 'DONE',
      modr_id: buyerId,
      mod_dtm: new Date().toISOString(),
    })
    .eq('order_id', orderId)
    .eq('buyer_id', buyerId)
    .eq('order_st_cd', 'READY') // 준비완료에서만 픽업
    .eq('del_yn', 'N')
    .select()
    .maybeSingle()

  if (!data) return null
  const order = data as MpsOrder
  await insertReleaseOut(db, order, buyerId)
  return order
}

// 자동완료 배치 — READY + ready_dtm 10분 경과 주문을 DONE 처리 (on-demand sweep)
// 반환: 자동완료된 주문 수
export async function autoCompleteReadyOrders(): Promise<number> {
  const db = getSupabaseAdmin()
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString()

  const { data } = await db
    .from('mps_order')
    .update({
      order_st_cd: 'DONE',
      modr_id: 'SYSTEM',
      mod_dtm: new Date().toISOString(),
    })
    .eq('order_st_cd', 'READY')
    .lte('ready_dtm', cutoff)
    .eq('del_yn', 'N')
    .select()

  const orders = (data as MpsOrder[] | null) ?? []
  for (const order of orders) {
    await insertReleaseOut(db, order, 'SYSTEM')
  }
  return orders.length
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
// userId=null → 전체 주문(관리자 전체보기 전용 — 호출자가 isAdmin 검증 후 null 전달). role은 표시 맥락 유지용
export async function listOrdersByRole(
  userId: string | null,
  role: 'buyer' | 'seller',
) {
  const column = role === 'buyer' ? 'buyer_id' : 'seller_id'
  let q = getSupabaseAdmin()
    .from('mps_order')
    .select(
      '*, mps_item ( item_nm, thumbnail_url, mps_shop ( shop_nm, addr, latd_crd, lngt_crd, place_id ) )',
    )
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })
  if (userId) q = q.eq(column, userId)
  const { data, error } = await q

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
