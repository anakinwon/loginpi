import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth-check'
import { createOrder, listOrdersByRole } from '@/lib/mps-order'

// GET /api/store/orders?role=buyer|seller — 내 주문 목록
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const role =
    req.nextUrl.searchParams.get('role') === 'seller' ? 'seller' : 'buyer'
  const orders = await listOrdersByRole(user.id, role)
  return NextResponse.json({ orders })
}

const createSchema = z.object({
  item_id: z.uuid(),
  meet_loc_desc: z.string().max(500).optional(),
})

// POST /api/store/orders — 주문 생성 (재고 원자적 차감 + PENDING)
// 응답: Pi SDK createPayment 파라미터 — 클라이언트가 결제 진행, 완료 시 MPS_ESCROW 분기 처리
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력값이 올바르지 않습니다' },
      { status: 400 },
    )
  }

  const slug = String(user.display_name ?? 'user').slice(0, 20)
  const result = await createOrder(
    parsed.data.item_id,
    user.id,
    parsed.data.meet_loc_desc ?? null,
    slug,
  )

  if ('error' in result) {
    const map = {
      OUT_OF_STOCK: {
        msg: '재고가 없거나 판매 중인 상품이 아닙니다',
        status: 409,
      },
      SELF_PURCHASE: { msg: '본인 상품은 구매할 수 없습니다', status: 400 },
      ORDER_NOT_FOUND: { msg: '주문을 찾을 수 없습니다', status: 404 },
      NOT_ALLOWED: { msg: '허용되지 않은 요청입니다', status: 403 },
      UNKNOWN: { msg: '주문 생성에 실패했습니다', status: 500 },
    } as const
    const { msg, status } = map[result.error]
    return NextResponse.json({ error: msg }, { status })
  }

  const { order } = result
  return NextResponse.json(
    {
      order,
      // Pi SDK createPayment 파라미터 (use-subscribe-plan 패턴)
      amount: Number(order.order_price_pi),
      memo: `🛒 PiShop 에스크로 결제`,
      metadata: {
        type: 'MPS_ESCROW',
        order_id: order.order_id,
        item_id: order.item_id,
      },
    },
    { status: 201 },
  )
}
