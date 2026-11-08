import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth-check'
import { cancelCartOrder } from '@/lib/mps-order'
import { apiError } from '@/lib/api-errors'

// POST /api/store/orders/cart/cancel — 카트 주문 롤백(결제 미완료 PENDING)
// 결제 취소·오류 시 클라이언트가 호출 → 라인 전체 재고 복원 + CANCELLED
const schema = z.object({
  order_id: z.uuid(),
  reason: z.string().max(200).optional(),
})

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return apiError('INVALID_INPUT', 400)
  }

  const slug = String(user.display_name ?? 'user').slice(0, 20)
  const result = await cancelCartOrder(
    parsed.data.order_id,
    user.id,
    parsed.data.reason ?? null,
    slug,
  )
  if ('error' in result) {
    return apiError('STORE_CANCEL_FAILED', 400)
  }
  return NextResponse.json({ order: result.order })
}
