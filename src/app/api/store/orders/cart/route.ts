import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { createCartOrder } from '@/lib/mps-order'

// POST /api/store/orders/cart — 카트 다중상품 주문 생성 (FR-14)
// 라인별 원자적 재고차감 후 PENDING 헤더 1건 + Pi 결제 파라미터 반환(합계 단일 결제).
// 결제 완료는 단건과 동일 — /api/payments/complete 의 MPS_ESCROW(order_id) 분기 재사용.
const cartSchema = z.object({
  shop_id: z.uuid(),
  items: z
    .array(z.object({ item_id: z.uuid(), qty: z.number().int().min(1).max(999) }))
    .min(1)
    .max(50),
  order_mthd_cd: z.enum(['DINE_IN', 'PICKUP', 'DELIVERY']).optional(),
  dlvr_addr: z.string().max(500).optional(),
})

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

  const parsed = cartSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력값이 올바르지 않습니다' },
      { status: 400 },
    )
  }

  const orderMthd = parsed.data.order_mthd_cd ?? 'DINE_IN'
  if (orderMthd === 'DELIVERY' && !parsed.data.dlvr_addr?.trim()) {
    return NextResponse.json({ error: '배달 위치를 입력해주세요' }, { status: 400 })
  }

  const slug = String(user.display_name ?? 'user').slice(0, 20)
  const result = await createCartOrder(
    parsed.data.shop_id,
    parsed.data.items,
    user.id,
    slug,
    orderMthd,
    parsed.data.dlvr_addr ?? null,
    isAdmin(user), // 관리자는 본인매장 테스트 결제 허용
  )

  if ('error' in result) {
    const map = {
      OUT_OF_STOCK: {
        msg: '재고가 부족하거나 판매 중이 아닌 상품이 있습니다',
        status: 409,
      },
      SELF_PURCHASE: { msg: '본인 매장 상품은 구매할 수 없습니다', status: 400 },
      SHOP_NOT_FOUND: { msg: '매장을 찾을 수 없습니다', status: 404 },
      EMPTY_CART: { msg: '카트가 비어 있습니다', status: 400 },
      BAD_QTY: { msg: '수량이 올바르지 않습니다', status: 400 },
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
      amount: Number(order.order_price_pi),
      memo: `🛒 PiShop 카트 결제 (${parsed.data.items.length}종)`,
      metadata: {
        type: 'MPS_ESCROW',
        order_id: order.order_id,
        item_id: order.item_id,
      },
    },
    { status: 201 },
  )
}
