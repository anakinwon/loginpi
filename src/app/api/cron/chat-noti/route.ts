import { NextRequest, NextResponse } from 'next/server'
import { dispatchChatNotis } from '@/lib/chat-noti'
import { ensureTelegramWebhook } from '@/lib/telegram-webhook'

// P2P 채팅 알림 발송 cron (Vercel Pro — 1분 주기 * * * * *).
// 앱 내 DM 새 메시지의 미러 알림(msg_noti_outbox noti_tp_cd='CHAT')을 Telegram으로 발송한다.
//   즉시성(당근 앱 푸시 대체)을 위해 1분 주기. 실제 발송은 dispatchChatNotis가
//   지연(45초)·미읽음 게이트로 판정 → 그 사이 앱에서 읽으면 skip(푸시 스팸 방지).
// 멱등: sent_yn 가드. on-demand 없이 cron 단독(주문 알림과 달리 결제 트리거가 없음).

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // webhook 자가치유 — 미등록/오등록이면 자기 도메인으로 재등록(내부 스로틀 10분, 실패해도 발송은 진행)
  const webhook = await ensureTelegramWebhook()

  try {
    const notis = await dispatchChatNotis()
    return NextResponse.json({ ok: true, notis, webhook })
  } catch (err) {
    console.error('[cron/chat-noti] 채팅 알림 발송 실패:', err)
    return NextResponse.json(
      { ok: false, error: 'chat_noti_failed' },
      { status: 500 },
    )
  }
}
