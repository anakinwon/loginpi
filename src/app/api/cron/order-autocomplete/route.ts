import { NextRequest, NextResponse } from 'next/server'
import { autoCompleteReadyOrders } from '@/lib/mps-order'
import { dispatchOrderNotis } from '@/lib/mps-noti'

// 오프라인 주문 자동완료 + 판매자 알림 발송 안전망 cron (Vercel Pro — 5분 주기 */5 * * * *).
// ① READY + ready_dtm 5분 경과 주문을 DONE 처리 + 판매자 A2U 자동 정산 — 멱등(release_txid 가드).
// ② msg_noti_outbox 미발송 알림을 Telegram으로 발송 — 멱등(sent_yn 가드).
// 두 작업 모두 on-demand가 유실/지연된 경우(아무도 주문 조회 안 함)의 주기적 복구 안전망.

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
    // 알림 발송은 자동완료와 독립 — 실패해도 자동완료 결과는 보존(베스트 에포트)
    let notis = { sent: 0, failed: 0, skipped: 0 }
    try {
      notis = await dispatchOrderNotis()
    } catch (notiErr) {
      console.error('[cron/order-autocomplete] 알림 발송 실패:', notiErr)
    }
    return NextResponse.json({ ok: true, completed, notis })
  } catch (err) {
    console.error('[cron/order-autocomplete] 자동완료 실패:', err)
    return NextResponse.json(
      { ok: false, error: 'autocomplete_failed' },
      { status: 500 },
    )
  }
}
