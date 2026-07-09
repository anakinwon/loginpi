import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { isA2UEnabled } from '@/lib/pi-a2u'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  listUnsettledOrders,
  listSettledOrders,
  settleOrderById,
} from '@/lib/mps-order'
import { apiError } from '@/lib/api-errors'

// 미정산(release_txid 없음) DONE 주문의 판매자 A2U 일괄 정산 — 관리자 백필/재시도 전용.
// GET 으로 대상 미리보기 → POST 로 실행. settleOrder가 멱등이라 재실행 안전(이중송금 방지).

// GET /api/admin/store/settle — 백필 대상 미리보기
export async function GET() {
  const user = await getSessionUser()
  if (!user || !isAdmin(user)) return apiError('FORBIDDEN', 401)

  const [orders, settled] = await Promise.all([
    listUnsettledOrders(),
    listSettledOrders(),
  ])

  // 판매자·구매자 표시정보 일괄 조회 — buyer/seller_id는 FK 없는 TEXT라 임베드 불가(별도 조회 후 매핑)
  const userIds = [
    ...new Set(
      [...orders, ...settled].flatMap((o) => [o.seller_id, o.buyer_id]),
    ),
  ]
  const { data: users } = userIds.length
    ? await getSupabaseAdmin()
        .from('sys_user')
        .select('id, pi_uid, pi_username, nick_nm, display_name')
        .in('id', userIds)
    : { data: [] }
  type UserRow = {
    id: string
    pi_uid: string | null
    pi_username: string | null
    nick_nm: string | null
    display_name: string | null
  }
  const byId = new Map(
    (users ?? []).map((u) => [(u as UserRow).id, u as UserRow]),
  )
  const displayName = (id: string) => {
    const u = byId.get(id)
    if (!u) return id.slice(0, 8)
    return u.pi_username
      ? `@${u.pi_username}`
      : (u.nick_nm ?? u.display_name ?? id.slice(0, 8))
  }

  return NextResponse.json({
    a2u_enabled: isA2UEnabled(),
    count: orders.length,
    total_pi: orders.reduce((sum, o) => sum + Number(o.order_price_pi), 0),
    orders: orders.map((o) => {
      const seller = byId.get(o.seller_id)
      return {
        ...o, // order_price_pi·ccy_cd·ccy_amt·settle_st_cd·settle_dtm·settle_err_tx·reg_dtm 포함
        seller_pi_username: seller?.pi_username ?? null,
        seller_linked: !!seller?.pi_uid, // false면 A2U 불가 → 수동 정산 필요
        buyer_display: displayName(o.buyer_id),
      }
    }),
    // 정산 완료 목록 — 성공일자(settle_dtm) 최신순
    settled: settled.map((o) => ({
      ...o, // settle_dtm·release_txid·ccy 포함
      seller_pi_username: byId.get(o.seller_id)?.pi_username ?? null,
      buyer_display: displayName(o.buyer_id),
    })),
  })
}

// POST /api/admin/store/settle — 정산 실행
//   body { order_ids?: string[] } — 지정 시 해당 주문만, 없으면 전체 미정산 대상
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user || !isAdmin(user)) return apiError('FORBIDDEN', 401)

  let body: { order_ids?: string[] } = {}
  try {
    body = (await req.json()) as { order_ids?: string[] }
  } catch {
    // 본문 없음 = 전체 미정산 대상
  }

  const targets =
    body.order_ids && body.order_ids.length > 0
      ? body.order_ids
      : (await listUnsettledOrders()).map((o) => o.order_id)

  const actorId = String(user.display_name ?? 'ADMIN').slice(0, 20)
  const results: Array<{ order_id: string; result: unknown }> = []
  for (const orderId of targets) {
    // 순차 처리 — A2U는 앱 지갑 단일 시퀀스라 동시 송금 시 미완료 충돌 방지
    const result = await settleOrderById(orderId, actorId)
    results.push({ order_id: orderId, result })
  }

  const settled = results.filter(
    (r) => (r.result as { status?: string })?.status === 'settled',
  ).length

  return NextResponse.json({
    ok: true,
    attempted: results.length,
    settled,
    results,
  })
}
