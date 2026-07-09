import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { markReady } from '@/lib/mps-order'
import { apiError } from '@/lib/api-errors'

// POST /api/store/orders/[orderId]/ready — 판매자 "준비완료" (PREPARING → READY)
// READY 시각(ready_dtm) 기록 → 5분 후 자동 거래완료 + 판매자 A2U 정산 타이머 시작
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const { orderId } = await params
  const order = await markReady(orderId, user.id)
  if (!order) {
    return apiError('STORE_READY_NOT_ALLOWED', 409)
  }
  return NextResponse.json({ order })
}
