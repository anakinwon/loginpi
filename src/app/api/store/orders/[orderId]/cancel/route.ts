import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { cancelOrder } from '@/lib/mps-order'
import { refundCancelledOrder } from '@/lib/mps-refund'

const cancelSchema = z.object({
  reason: z.string().min(1).max(500), // 취소 사유 필수 (FR-10)
})

// POST /api/store/orders/[orderId]/cancel — 주문 취소 + 재고 복원
// PENDING·TRADING(레거시 ESCROW 포함): 당사자·관리자 | 레거시 SELLER_DONE: 구매자·관리자만 | DONE: 불가
// 거래중 취소 시 보증금 활성 판매자 거래에 한해 취소수수료 0.1π (fn_mps_order_cancel)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { orderId } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const parsed = cancelSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: '취소 사유를 입력해주세요' },
      { status: 400 },
    )
  }

  const result = await cancelOrder(
    orderId,
    user.id,
    parsed.data.reason,
    isAdmin(user),
  )
  if ('error' in result) {
    if (result.error === 'ORDER_NOT_FOUND') {
      return NextResponse.json(
        { error: '주문을 찾을 수 없습니다' },
        { status: 404 },
      )
    }
    return NextResponse.json(
      { error: '취소할 수 없는 주문입니다' },
      { status: 403 },
    )
  }

  // 결제 완료 주문을 구매자가 취소한 경우 자동 환불(A2U). 환불 실패·시드 미설정은
  // 취소 자체를 막지 않음(취소는 이미 확정) — 환불 상태만 응답에 실어 클라이언트가 안내.
  const refund = await refundCancelledOrder(orderId, user.id).catch((e) => {
    console.error('[cancel] 환불 처리 예외:', orderId, e)
    return {
      status: 'pending' as const,
      amount: 0,
      reason: 'A2U_FAILED' as const,
    }
  })

  return NextResponse.json({ order: result.order, refund })
}
