import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { cancelOrder } from '@/lib/mps-order'
import { refundCancelledOrder } from '@/lib/mps-refund'
import { recordUserAction } from '@/lib/event'
import { enqueueTxnStNoti } from '@/lib/trade-noti'
import { apiError } from '@/lib/api-errors'

const cancelSchema = z.object({
  reason: z.string().min(1).max(500), // 취소 사유 필수 (FR-10)
  // 취소 화면 역할 — 판매관리(seller)/구매관리(buyer). self-purchase 수수료 당사자 구분용
  // (비-self 주문은 RPC·환불계산이 id로 강제하므로 이 힌트는 무시됨 — 보안)
  role: z.enum(['buyer', 'seller']).optional(),
})

// POST /api/store/orders/[orderId]/cancel — 주문 취소 + 재고 복원
// PENDING·TRADING(레거시 ESCROW 포함): 당사자·관리자 | 레거시 SELLER_DONE: 구매자·관리자만 | DONE: 불가
// 거래중 취소 시 보증금 활성 판매자 거래에 한해 취소수수료 0.1π (fn_mps_order_cancel)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const { orderId } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }

  const parsed = cancelSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('STORE_CANCEL_REASON_REQUIRED', 400)
  }

  const cancelRole =
    parsed.data.role === 'seller'
      ? 'SELLER'
      : parsed.data.role === 'buyer'
        ? 'BUYER'
        : null
  const result = await cancelOrder(
    orderId,
    user.id,
    parsed.data.reason,
    isAdmin(user),
    cancelRole,
  )
  if ('error' in result) {
    if (result.error === 'ORDER_NOT_FOUND') {
      return apiError('STORE_ORDER_NOT_FOUND', 404)
    }
    return apiError('STORE_ORDER_NOT_CANCELABLE', 403)
  }

  // 결제 완료 주문을 구매자가 취소한 경우 자동 환불(A2U). 환불 실패·시드 미설정은
  // 취소 자체를 막지 않음(취소는 이미 확정) — 환불 상태만 응답에 실어 클라이언트가 안내.
  const refund = await refundCancelledOrder(orderId, user.id, cancelRole).catch(
    (e) => {
      console.error('[cancel] 환불 처리 예외:', orderId, e)
      return {
        status: 'pending' as const,
        amount: 0,
        reason: 'A2U_FAILED' as const,
      }
    },
  )

  // 상대방에게 취소 통지 — 관리자 취소면 양측 통지 (PRD_13 §18-9 TXN_ST)
  if (result.order) {
    await enqueueTxnStNoti(result.order, 'CANCELLED', user.id)
  }

  // M7/M8: 거래 취소 미션 기록 (판매자 vs 구매자 판별)
  // result.order는 MpsOrder 타입 — 실제 컬럼명 seller_id/buyer_id를 직접 구조분해(오타 방지)
  if (result.order) {
    const { seller_id, buyer_id } = result.order

    if (user.id === seller_id) {
      // M7: 판매자 거래 취소
      recordUserAction('seller_cancel', user.id, { order_id: orderId }).catch(
        (err) => console.error(`[M7] 미션 기록 실패: ${err.message}`),
      )
    } else if (user.id === buyer_id) {
      // M8: 구매자 거래 취소
      recordUserAction('buyer_cancel', user.id, { order_id: orderId }).catch(
        (err) => console.error(`[M8] 미션 기록 실패: ${err.message}`),
      )
    }
  }

  return NextResponse.json({ order: result.order, refund })
}
