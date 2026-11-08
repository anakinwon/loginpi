import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { markBuyerDone } from '@/lib/mps-order'
import { apiError } from '@/lib/api-errors'

// POST /api/store/orders/[orderId]/release — ① 구매자 "물건 수령 완료" (TRADING → BUYER_DONE)
// 이후 판매자가 /complete로 거래를 종결해야 정산 단계로 넘어간다
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const { orderId } = await params
  const order = await markBuyerDone(orderId, user.id)
  if (!order) {
    return apiError('STORE_RELEASE_NOT_ALLOWED', 409)
  }
  return NextResponse.json({ order })
}
