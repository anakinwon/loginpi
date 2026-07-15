import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { markPreparing } from '@/lib/mps-order'
import { resolveOrderSeller } from '@/lib/shop-staff-access'
import { apiError } from '@/lib/api-errors'

// POST /api/store/orders/[orderId]/accept — "접수" (ORDERED → PREPARING)
// 소유자 또는 등록 직원(mps_shop_staff) 가능 — modr_id에 행위자 기록
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const { orderId } = await params
  const sellerId = await resolveOrderSeller(orderId, user.id)
  if (!sellerId) return apiError('STORE_ACCEPT_NOT_ALLOWED', 409)
  const order = await markPreparing(orderId, sellerId, user.id)
  if (!order) {
    return apiError('STORE_ACCEPT_NOT_ALLOWED', 409)
  }
  return NextResponse.json({ order })
}
