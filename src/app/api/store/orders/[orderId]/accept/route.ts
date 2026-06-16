import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { markPreparing } from '@/lib/mps-order'

// POST /api/store/orders/[orderId]/accept — 판매자 "접수" (ORDERED → PREPARING)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { orderId } = await params
  const order = await markPreparing(orderId, user.id)
  if (!order) {
    return NextResponse.json(
      { error: '접수할 수 없습니다 (상품주문중인 본인 매장 주문만 가능)' },
      { status: 409 },
    )
  }
  return NextResponse.json({ order })
}
