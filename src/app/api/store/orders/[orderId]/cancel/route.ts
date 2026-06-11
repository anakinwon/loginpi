import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { cancelOrder } from '@/lib/mps-order'

const cancelSchema = z.object({
  reason: z.string().min(1).max(500), // 취소 사유 필수 (FR-10)
})

// POST /api/store/orders/[orderId]/cancel — 주문 취소 + 재고 복원
// PENDING·ESCROW·TRADING: 당사자·관리자 | SELLER_DONE: 구매자·관리자만 | DONE: 불가
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { orderId } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const parsed = cancelSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '취소 사유를 입력해주세요' }, { status: 400 })
  }

  const result = await cancelOrder(orderId, user.id, parsed.data.reason, isAdmin(user))
  if ('error' in result) {
    if (result.error === 'ORDER_NOT_FOUND') {
      return NextResponse.json({ error: '주문을 찾을 수 없습니다' }, { status: 404 })
    }
    return NextResponse.json({ error: '취소할 수 없는 주문입니다' }, { status: 403 })
  }
  return NextResponse.json({ order: result.order })
}
