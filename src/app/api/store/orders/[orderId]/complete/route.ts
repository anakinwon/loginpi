import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { markComplete } from '@/lib/mps-order'

// POST /api/store/orders/[orderId]/complete — ② 판매자 "거래 완료" (BUYER_DONE → DONE)
// 양측 확인 완료 → 판매자 A2U 자동 정산 (실패 시 정산대기 폴백, markComplete 내부 settleOrder)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { orderId } = await params
  const order = await markComplete(orderId, user.id)
  if (!order) {
    return NextResponse.json(
      {
        error:
          '거래 완료 처리할 수 없습니다 (구매자 수령 확인 후 본인 판매 주문만 가능)',
      },
      { status: 409 },
    )
  }
  return NextResponse.json({ order })
}
