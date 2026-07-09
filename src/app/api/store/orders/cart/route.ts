import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { createCartOrder } from '@/lib/mps-order'
import { withGuard } from '@/lib/api-guard'
import { apiError } from '@/lib/api-errors'

// POST /api/store/orders/cart — 카트 다중상품 주문 생성 (FR-14)
// 라인별 원자적 재고차감 후 PENDING 헤더 1건 + Pi 결제 파라미터 반환(합계 단일 결제).
// 결제 완료는 단건과 동일 — /api/payments/complete 의 MPS_ESCROW(order_id) 분기 재사용.
const cartSchema = z.object({
  shop_id: z.uuid(),
  items: z
    .array(
      z.object({ item_id: z.uuid(), qty: z.number().int().min(1).max(999) }),
    )
    .min(1)
    .max(50),
  order_mthd_cd: z.enum(['DINE_IN', 'PICKUP', 'DELIVERY']).optional(),
  dlvr_addr: z.string().max(500).optional(),
})

async function handlePOST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }

  const parsed = cartSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('INVALID_INPUT', 400)
  }

  const orderMthd = parsed.data.order_mthd_cd ?? 'DINE_IN'
  if (orderMthd === 'DELIVERY' && !parsed.data.dlvr_addr?.trim()) {
    return apiError('STORE_DELIVERY_ADDR_REQUIRED', 400)
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
      OUT_OF_STOCK: { code: 'STORE_CART_OUT_OF_STOCK', status: 409 },
      SELF_PURCHASE: { code: 'STORE_SELF_PURCHASE_SHOP', status: 400 },
      SHOP_NOT_FOUND: { code: 'STORE_SHOP_NOT_FOUND', status: 404 },
      EMPTY_CART: { code: 'STORE_EMPTY_CART', status: 400 },
      BAD_QTY: { code: 'STORE_BAD_QTY', status: 400 },
      ORDER_NOT_FOUND: { code: 'STORE_ORDER_NOT_FOUND', status: 404 },
      NOT_ALLOWED: { code: 'STORE_NOT_ALLOWED', status: 403 },
      UNKNOWN: { code: 'STORE_ORDER_CREATE_FAILED', status: 500 },
    } as const
    const { code, status } = map[result.error]
    return apiError(code, status)
  }

  const { order } = result
  return NextResponse.json(
    {
      order,
      amount: Number(order.order_price_pi),
      memo: `🛒 PyShop 카트 결제 (${parsed.data.items.length}종)`,
      metadata: {
        type: 'MPS_ESCROW',
        order_id: order.order_id,
        item_id: order.item_id,
      },
    },
    { status: 201 },
  )
}

export const POST = withGuard(handlePOST)
