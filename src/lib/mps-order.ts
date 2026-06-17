import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'
import { sendA2U, isA2UEnabled } from './pi-a2u'

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
  const ccy = itemCcy as {
    ccy_cd: string | null
    ccy_amt: number | null
  } | null

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
): Promise<{ order: MpsOrder } | { error: OrderError }> {
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
    console.error('[cart order] RPC error:', error.message) // 서버 로그만(클라이언트 미노출)
    return { error: mapRpcError(error.message) }
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
    .select('ccy_cd, ccy_amt, mps_item(shop_id, item_nm)')
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
  const itemNm =
    (itemObj as { item_nm?: string | null } | null)?.item_nm ?? null
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

  // 판매자 주문 알림 enqueue(Outbox) — 결제 확정(에스크로 입금) 직후 1회.
  // 발송은 별도 디스패처가 담당. 여기선 "알림 누락" 원천 차단을 위해 DB 영속화만 한다.
  // markEscrow의 상태 가드(PENDING→nextState)가 천연 멱등장치라 주문당 1회만 도달.
  const order = data as MpsOrder
  const orderMthdCd =
    (data as { order_mthd_cd?: string | null }).order_mthd_cd ?? null
  await enqueueOrderNoti(db, order, itemNm, orderMthdCd)
  return order
}

// 주문 확정 알림을 Outbox에 적재 — 멱등(order_id + TELEGRAM 채널 기준 1행).
//   본문엔 상품·금액·구매자 별칭만 스냅샷(실명·전화·주소 등 PII는 외부 채널 경유라 제외 → 상세는 딥링크로 앱 내 열람).
async function enqueueOrderNoti(
  db: ReturnType<typeof getSupabaseAdmin>,
  order: MpsOrder,
  itemNm: string | null,
  orderMthdCd: string | null,
) {
  // 멱등 — 이미 이 주문의 TELEGRAM 알림 행이 있으면 재INSERT 금지(백필·재시도 안전)
  const { data: existing } = await db
    .from('msg_noti_outbox')
    .select('noti_id')
    .eq('order_id', order.order_id)
    .eq('noti_chnl_cd', 'TELEGRAM')
    .limit(1)
  if (existing && existing.length > 0) return

  // 구매자 별칭 스냅샷 — 별명 > 표시명 > Pi username 순(없으면 '구매자')
  const { data: buyer } = await db
    .from('sys_user')
    .select('nick_nm, display_name, pi_username')
    .eq('id', order.buyer_id)
    .maybeSingle()
  const b = buyer as {
    nick_nm?: string | null
    display_name?: string | null
    pi_username?: string | null
  } | null
  const buyerAlias = b?.nick_nm || b?.display_name || b?.pi_username || '구매자'

  const body = JSON.stringify({
    order_id: order.order_id,
    item_nm: itemNm,
    order_price_pi: Number(order.order_price_pi),
    buyer_alias: buyerAlias,
    order_mthd_cd: orderMthdCd,
    reg_dtm: order.reg_dtm,
  })

  await db.from('msg_noti_outbox').insert({
    order_id: order.order_id,
    recv_usr_id: order.seller_id, // sys_user.id (TEXT 보관, UUID 컬럼에 캐스팅 적재)
    noti_chnl_cd: 'TELEGRAM',
    noti_body: body,
    regr_id: 'SYSTEM',
    modr_id: 'SYSTEM',
  })
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

// ② 판매자 "거래 완료" — BUYER_DONE → DONE + 판매자 A2U 자동 정산 (실패 시 정산대기 폴백)
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
  await settleOrder(db, order, sellerId)
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

// 판매자 "준비완료" — PREPARING → READY (상품준비완료, 5분 자동완료 타이머 시작)
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

// 정산 송금 단위 반올림 (1π = 10^7, Pi A2U 정밀도 정합)
const round7 = (n: number) => Math.round(n * 1e7) / 1e7

export type SettleResult =
  | { status: 'settled'; txid: string }
  | {
      status: 'pending'
      reason: 'NO_UID' | 'A2U_DISABLED' | 'A2U_FAILED'
      detail?: string
    }
  | { status: 'skipped'; reason: 'ALREADY_SETTLED' }

// 정산 대기(미송금) RELEASE_OUT 이력 보장 — 이미 RELEASE_OUT 행이 있으면 중복 INSERT 금지(멱등)
async function insertPendingRelease(
  db: ReturnType<typeof getSupabaseAdmin>,
  order: MpsOrder,
  actorId: string,
  memo: string,
) {
  const { data: existing } = await db
    .from('mps_txn_hist')
    .select('txn_id')
    .eq('order_id', order.order_id)
    .eq('txn_type_cd', 'RELEASE_OUT')
    .limit(1)
  if (existing && existing.length > 0) return
  await db.from('mps_txn_hist').insert({
    order_id: order.order_id,
    user_id: order.seller_id,
    txn_type_cd: 'RELEASE_OUT',
    pi_amt: -Number(order.order_price_pi),
    // 자국통화 참고가 스냅샷 — 출금이므로 부호 −(pi_amt 부호 일치)
    ccy_cd: order.ccy_cd ?? null,
    ccy_amt: order.ccy_amt != null ? -Number(order.ccy_amt) : null,
    memo,
    regr_id: actorId,
    modr_id: actorId,
  })
}

// 판매자 정산 — 에스크로(앱 지갑) → 판매자 A2U 실송금. markComplete·markPickup·자동완료·백필 공용.
//   성공: order.release_txid 기록 + RELEASE_OUT(txid) 정산완료 (멱등 핵심 = release_txid)
//   실패/비활성/UID없음: RELEASE_OUT(미송금) 정산대기 → 백필/재시도 대상으로 남김
async function settleOrder(
  db: ReturnType<typeof getSupabaseAdmin>,
  order: MpsOrder,
  actorId: string,
): Promise<SettleResult> {
  // 멱등 — 이미 정산 완료(release_txid 또는 txid 보유 RELEASE_OUT)면 재송금 금지(이중지급 방지)
  if (order.release_txid)
    return { status: 'skipped', reason: 'ALREADY_SETTLED' }
  const { data: settled } = await db
    .from('mps_txn_hist')
    .select('txn_id')
    .eq('order_id', order.order_id)
    .eq('txn_type_cd', 'RELEASE_OUT')
    .not('pi_txid', 'is', null)
    .limit(1)
  if (settled && settled.length > 0)
    return { status: 'skipped', reason: 'ALREADY_SETTLED' }

  const amount = round7(Number(order.order_price_pi))

  // 판매자 Pi UID (A2U 수신자)
  const { data: seller } = await db
    .from('sys_user')
    .select('pi_uid')
    .eq('id', order.seller_id)
    .maybeSingle()
  const uid = (seller as { pi_uid?: string } | null)?.pi_uid
  if (!uid) {
    await insertPendingRelease(
      db,
      order,
      actorId,
      '판매자 Pi 미연동 — 운영자 수동 정산 필요',
    )
    return { status: 'pending', reason: 'NO_UID' }
  }

  if (!isA2UEnabled()) {
    await insertPendingRelease(
      db,
      order,
      actorId,
      'A2U 비활성 — 운영자 수동 정산 필요',
    )
    return { status: 'pending', reason: 'A2U_DISABLED' }
  }

  // A2U 실송금
  let txid: string
  try {
    const res = await sendA2U({
      uid,
      amount,
      memo: 'MPS payout',
      metadata: { type: 'MPS_RELEASE', order_id: order.order_id },
    })
    txid = res.txid
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    console.error('[settle] 판매자 정산 A2U 실패:', order.order_id, detail)
    await insertPendingRelease(
      db,
      order,
      actorId,
      'A2U 송금 실패 — 재시도/수동 정산 필요',
    )
    return { status: 'pending', reason: 'A2U_FAILED', detail }
  }

  // 송금 완료(txid 확정) — 이후 장부 실패해도 throw 금지(재시도 시 이중송금 방지), CRITICAL 로그로 복구
  await db
    .from('mps_order')
    .update({
      release_txid: txid,
      modr_id: actorId,
      mod_dtm: new Date().toISOString(),
    })
    .eq('order_id', order.order_id)

  // 기존 정산대기 행이 있으면 txid로 승격, 없으면 신규 INSERT (정산 행 1개 유지)
  const { data: pending } = await db
    .from('mps_txn_hist')
    .select('txn_id')
    .eq('order_id', order.order_id)
    .eq('txn_type_cd', 'RELEASE_OUT')
    .is('pi_txid', null)
    .limit(1)
  if (pending && pending.length > 0) {
    const { error: updErr } = await db
      .from('mps_txn_hist')
      .update({
        pi_txid: txid,
        memo: '판매자 정산 완료 (A2U)',
        modr_id: actorId,
      })
      .eq('txn_id', (pending[0] as { txn_id: string }).txn_id)
    if (updErr)
      console.error(
        `[settle] CRITICAL 송금 성공·장부갱신 실패 — 수동기록 필요. order=${order.order_id} txid=${txid} amount=${amount} err=${updErr.message}`,
      )
  } else {
    const { error: insErr } = await db.from('mps_txn_hist').insert({
      order_id: order.order_id,
      user_id: order.seller_id,
      txn_type_cd: 'RELEASE_OUT',
      pi_amt: -amount,
      ccy_cd: order.ccy_cd ?? null,
      ccy_amt: order.ccy_amt != null ? -Number(order.ccy_amt) : null,
      pi_txid: txid,
      memo: '판매자 정산 완료 (A2U)',
      regr_id: actorId,
      modr_id: actorId,
    })
    if (insErr)
      console.error(
        `[settle] CRITICAL 송금 성공·장부기록 실패 — 수동기록 필요. order=${order.order_id} txid=${txid} amount=${amount} err=${insErr.message}`,
      )
  }
  return { status: 'settled', txid }
}

// 백필/재시도 — 미정산 DONE 주문 단건 정산 (관리자 엔드포인트 전용)
export async function settleOrderById(
  orderId: string,
  actorId: string,
): Promise<
  SettleResult | { status: 'skipped'; reason: 'NOT_FOUND' | 'NOT_DONE' }
> {
  const db = getSupabaseAdmin()
  const { data } = await db
    .from('mps_order')
    .select('*')
    .eq('order_id', orderId)
    .eq('del_yn', 'N')
    .maybeSingle()
  if (!data) return { status: 'skipped', reason: 'NOT_FOUND' }
  const order = data as MpsOrder
  if (order.order_st_cd !== 'DONE')
    return { status: 'skipped', reason: 'NOT_DONE' }
  return settleOrder(db, order, actorId)
}

// 백필 미리보기 — 미정산(release_txid 없음) DONE 주문 목록 (오래된 순)
export type UnsettledOrder = Pick<
  MpsOrder,
  | 'order_id'
  | 'seller_id'
  | 'buyer_id'
  | 'order_price_pi'
  | 'ccy_cd'
  | 'ccy_amt'
  | 'mod_dtm'
>
export async function listUnsettledOrders(): Promise<UnsettledOrder[]> {
  const { data } = await getSupabaseAdmin()
    .from('mps_order')
    .select(
      'order_id, seller_id, buyer_id, order_price_pi, ccy_cd, ccy_amt, mod_dtm',
    )
    .eq('order_st_cd', 'DONE')
    .is('release_txid', null)
    .eq('del_yn', 'N')
    .order('mod_dtm', { ascending: true })
  return (data as UnsettledOrder[] | null) ?? []
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
  await settleOrder(db, order, buyerId)
  return order
}

// 자동완료 배치 — READY + ready_dtm 5분 경과 주문을 DONE 처리 + 판매자 A2U 자동 정산 (on-demand sweep + 5분 cron)
// 반환: 자동완료된 주문 수
export async function autoCompleteReadyOrders(): Promise<number> {
  const db = getSupabaseAdmin()
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString()

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
    await settleOrder(db, order, 'SYSTEM')
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
      // 대표 item + 카트 주문 라인 전체(lines: 상품명·수량) 임베드
      '*, mps_item ( item_nm, thumbnail_url, mps_shop ( shop_nm, addr, latd_crd, lngt_crd, place_id ) ), lines:mps_order_item ( ord_qty, price_pi, item:mps_item ( item_nm ) )',
    )
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })
  if (userId) q = q.eq(column, userId)
  const { data, error } = await q

  if (error) throw new Error(error.message)
  const orders = data ?? []

  // 판매 관리: 주문자(buyer) 별명/PI username 첨부 — 준비완료 시 호명용.
  // buyer_id는 FK 없는 TEXT(sys_user.id)라 임베드 불가 → 별도 조회 후 매핑.
  if (role === 'seller' && orders.length > 0) {
    const buyerIds = [
      ...new Set(orders.map((o) => (o as { buyer_id: string }).buyer_id)),
    ]
    const { data: buyers } = await getSupabaseAdmin()
      .from('sys_user')
      .select('id, nick_nm, display_name, pi_username')
      .in('id', buyerIds)
    const byId = new Map(
      (buyers ?? []).map((b) => [(b as { id: string }).id, b]),
    )
    return orders.map((o) => ({
      ...(o as object),
      buyer: byId.get((o as { buyer_id: string }).buyer_id) ?? null,
    }))
  }
  return orders
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
