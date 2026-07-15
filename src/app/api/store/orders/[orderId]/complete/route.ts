import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { markComplete } from '@/lib/mps-order'
import { resolveOrderSeller } from '@/lib/shop-staff-access'
import { apiError } from '@/lib/api-errors'

// POST /api/store/orders/[orderId]/complete — ② "거래 완료" (BUYER_DONE → DONE)
// 양측 확인 완료 → 판매자 A2U 자동 정산 (실패 시 정산대기 폴백, markComplete 내부 settleOrder)
// 소유자 또는 등록 직원 가능 — 정산은 항상 실제 seller에게, modr_id에 행위자 기록
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const { orderId } = await params
  const sellerId = await resolveOrderSeller(orderId, user.id)
  if (!sellerId) return apiError('STORE_COMPLETE_NOT_ALLOWED', 409)
  const order = await markComplete(orderId, sellerId, user.id)
  if (!order) {
    return apiError('STORE_COMPLETE_NOT_ALLOWED', 409)
  }
  return NextResponse.json({ order })
}
