import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { markBuyerDone } from '@/lib/mps-order'

// POST /api/store/orders/[orderId]/release — ① 구매자 "물건 수령 완료" (TRADING → BUYER_DONE)
// 이후 판매자가 /complete로 거래를 종결해야 정산 단계로 넘어간다
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { orderId } = await params
  const order = await markBuyerDone(orderId, user.id)
  if (!order) {
    return NextResponse.json(
      {
        error:
          '수령 완료 처리할 수 없습니다 (거래중 상태의 본인 구매 주문만 가능)',
      },
      { status: 409 },
    )
  }
  return NextResponse.json({ order })
}
