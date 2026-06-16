import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { markPickup } from '@/lib/mps-order'

// POST /api/store/orders/[orderId]/pickup — 구매자 "픽업" (READY → DONE + 정산)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { orderId } = await params
  const order = await markPickup(orderId, user.id)
  if (!order) {
    return NextResponse.json(
      { error: '픽업 처리할 수 없습니다 (상품준비완료된 본인 주문만 가능)' },
      { status: 409 },
    )
  }
  return NextResponse.json({ order })
}
