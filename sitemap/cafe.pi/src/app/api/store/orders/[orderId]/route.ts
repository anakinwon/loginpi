import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getOrderForUser } from '@/lib/mps-order'
import { apiError } from '@/lib/api-errors'

// GET /api/store/orders/[orderId] — 주문 상세 (당사자·관리자만, 비당사자 403)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const { orderId } = await params
  const result = await getOrderForUser(orderId, user.id, isAdmin(user))

  if ('error' in result) {
    if (result.error === 'NOT_FOUND') {
      return apiError('STORE_ORDER_NOT_FOUND', 404)
    }
    return apiError('STORE_ORDER_NOT_PARTY', 403)
  }
  return NextResponse.json({ order: result.order })
}
