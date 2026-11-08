import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { markPickup } from '@/lib/mps-order'
import { apiError } from '@/lib/api-errors'

// POST /api/store/orders/[orderId]/pickup — 구매자 "픽업" (READY → DONE + 정산)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const { orderId } = await params
  const order = await markPickup(orderId, user.id)
  if (!order) {
    return apiError('STORE_PICKUP_NOT_ALLOWED', 409)
  }
  return NextResponse.json({ order })
}
