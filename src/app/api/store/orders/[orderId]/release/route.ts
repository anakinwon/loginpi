import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { markBuyerDone } from '@/lib/mps-order'

// POST /api/store/orders/[orderId]/release — ② 구매자 "물건 수령 완료" (SELLER_DONE → DONE)
// 양방향 확인 완료 → RELEASE_OUT 이력 기록 (실 Pi 정산은 운영자 에스크로 계정에서 처리)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { orderId } = await params
  const order = await markBuyerDone(orderId, user.id)
  if (!order) {
    return NextResponse.json(
      { error: '수령 완료 처리할 수 없습니다 (판매자 전달 완료 후 본인 구매 주문만 가능)' },
      { status: 409 },
    )
  }
  return NextResponse.json({ order })
}
