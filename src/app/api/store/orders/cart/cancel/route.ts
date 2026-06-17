import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth-check'
import { cancelCartOrder } from '@/lib/mps-order'

// POST /api/store/orders/cart/cancel — 카트 주문 롤백(결제 미완료 PENDING)
// 결제 취소·오류 시 클라이언트가 호출 → 라인 전체 재고 복원 + CANCELLED
const schema = z.object({
  order_id: z.uuid(),
  reason: z.string().max(200).optional(),
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

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력값이 올바르지 않습니다' },
      { status: 400 },
    )
  }

  const slug = String(user.display_name ?? 'user').slice(0, 20)
  const result = await cancelCartOrder(
    parsed.data.order_id,
    user.id,
    parsed.data.reason ?? null,
    slug,
  )
  if ('error' in result) {
    return NextResponse.json({ error: '취소에 실패했습니다' }, { status: 400 })
  }
  return NextResponse.json({ order: result.order })
}
