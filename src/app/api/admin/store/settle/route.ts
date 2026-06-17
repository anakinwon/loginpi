import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { isA2UEnabled } from '@/lib/pi-a2u'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { listUnsettledOrders, settleOrderById } from '@/lib/mps-order'

// 미정산(release_txid 없음) DONE 주문의 판매자 A2U 일괄 정산 — 관리자 백필/재시도 전용.
// GET 으로 대상 미리보기 → POST 로 실행. settleOrder가 멱등이라 재실행 안전(이중송금 방지).

// GET /api/admin/store/settle — 백필 대상 미리보기
export async function GET() {
  const user = await getSessionUser()
  if (!user || !isAdmin(user))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const orders = await listUnsettledOrders()

  // 판매자 Pi 연동 여부 첨부 — pi_uid 없으면 A2U 불가(수동 정산 대상)
  const sellerIds = [...new Set(orders.map((o) => o.seller_id))]
  const { data: sellers } = sellerIds.length
    ? await getSupabaseAdmin()
        .from('sys_user')
        .select('id, pi_uid, pi_username')
        .in('id', sellerIds)
    : { data: [] }
  const byId = new Map(
    (sellers ?? []).map((s) => [(s as { id: string }).id, s]),
  )

  return NextResponse.json({
    a2u_enabled: isA2UEnabled(),
    count: orders.length,
    total_pi: orders.reduce((sum, o) => sum + Number(o.order_price_pi), 0),
    orders: orders.map((o) => {
      const s = byId.get(o.seller_id) as
        | { pi_uid: string | null; pi_username: string | null }
        | undefined
      return {
        ...o,
        seller_pi_username: s?.pi_username ?? null,
        seller_linked: !!s?.pi_uid, // false면 A2U 불가 → 수동 정산 필요
      }
    }),
  })
}

// POST /api/admin/store/settle — 정산 실행
//   body { order_ids?: string[] } — 지정 시 해당 주문만, 없으면 전체 미정산 대상
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user || !isAdmin(user))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

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
