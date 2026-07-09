import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { markComplete } from '@/lib/mps-order'
import { apiError } from '@/lib/api-errors'

// POST /api/store/orders/[orderId]/complete — ② 판매자 "거래 완료" (BUYER_DONE → DONE)
// 양측 확인 완료 → 판매자 A2U 자동 정산 (실패 시 정산대기 폴백, markComplete 내부 settleOrder)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const { orderId } = await params
  const order = await markComplete(orderId, user.id)
  if (!order) {
    return apiError('STORE_COMPLETE_NOT_ALLOWED', 409)
  }
  return NextResponse.json({ order })
}
