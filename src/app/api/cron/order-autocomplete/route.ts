import { NextRequest, NextResponse } from 'next/server'
import { autoCompleteReadyOrders } from '@/lib/mps-order'

// 오프라인 주문 자동완료 안전망 cron (Vercel Pro — 5분 주기 */5 * * * *).
// READY + ready_dtm 5분 경과 주문을 DONE 처리 + 판매자 A2U 자동 정산 — GET /api/store/orders의
// on-demand sweep이 유실/지연된 경우(아무도 주문 조회 안 함)를 주기적으로 복구. 멱등(release_txid 가드).

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const completed = await autoCompleteReadyOrders()
    return NextResponse.json({ ok: true, completed })
  } catch (err) {
    console.error('[cron/order-autocomplete] 자동완료 실패:', err)
    return NextResponse.json(
      { ok: false, error: 'autocomplete_failed' },
      { status: 500 },
    )
  }
}
