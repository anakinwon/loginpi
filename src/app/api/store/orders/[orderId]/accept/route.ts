import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { markPreparing } from '@/lib/mps-order'
import { apiError } from '@/lib/api-errors'

// POST /api/store/orders/[orderId]/accept — 판매자 "접수" (ORDERED → PREPARING)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const { orderId } = await params
  const order = await markPreparing(orderId, user.id)
  if (!order) {
    return apiError('STORE_ACCEPT_NOT_ALLOWED', 409)
  }
  return NextResponse.json({ order })
}
