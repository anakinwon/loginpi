import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getOrderForUser } from '@/lib/mps-order'

// GET /api/store/orders/[orderId] — 주문 상세 (당사자·관리자만, 비당사자 403)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { orderId } = await params
  const result = await getOrderForUser(orderId, user.id, isAdmin(user))

  if ('error' in result) {
    if (result.error === 'NOT_FOUND') {
      return NextResponse.json(
        { error: '주문을 찾을 수 없습니다' },
        { status: 404 },
      )
    }
    return NextResponse.json(
      { error: '주문 당사자만 조회할 수 있습니다' },
      { status: 403 },
    )
  }
  return NextResponse.json({ order: result.order })
}
