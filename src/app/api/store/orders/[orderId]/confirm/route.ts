import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { markSellerDone } from '@/lib/mps-order'

// POST /api/store/orders/[orderId]/confirm — ① 판매자 "물건 전달 완료" (ESCROW → SELLER_DONE)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { orderId } = await params
  const order = await markSellerDone(orderId, user.id)
  if (!order) {
    return NextResponse.json(
      { error: '전달 완료 처리할 수 없습니다 (에스크로 완료 상태의 본인 판매 주문만 가능)' },
      { status: 409 },
    )
  }
  return NextResponse.json({ order })
}
