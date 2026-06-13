import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { refundCancelledOrder } from '@/lib/mps-refund'

// POST /api/admin/store/orders/[orderId]/refund — 관리자 수동 환불 재시도 (멱등)
// 용도: ① 환불 누락된 기존 취소 주문 정상화 ② A2U 실패·시드 설정 후 재실행 ③ 분쟁 정산
// 실제 송금은 PI_WALLET_PRIVATE_SEED 설정 시에만 수행 (미설정 시 pending 반환).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const user = await getSessionUser()
  if (!isAdmin(user))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { orderId } = await params
  const refund = await refundCancelledOrder(orderId, user!.id)

  // 멱등·정책상 환불 불가 사유는 4xx, 실제 송금 보류/완료는 200으로 구분
  if (refund.status === 'skipped') {
    return NextResponse.json({ refund }, { status: 409 })
  }
  return NextResponse.json({ refund })
}
