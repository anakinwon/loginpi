import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyLinkCode } from '@/lib/telegram-link'
import { sendTelegramMessage } from '@/lib/telegram'

// Telegram webhook — 봇이 받은 업데이트를 처리. 현재는 /start <code> 연동만.
//   보안: setWebhook 시 등록한 secret_token을 헤더로 대조(위조 차단).
//   응답은 항상 200(ok) — Telegram 재시도 폭주 방지(처리 실패는 사용자 안내 메시지로 흡수).

export async function POST(req: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  if (expected) {
    const got = req.headers.get('x-telegram-bot-api-secret-token')
    if (got !== expected) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }
  }

  let update: unknown
  try {
    update = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const msg = (
    update as { message?: { text?: string; chat?: { id?: number } } }
  )?.message
  const text = msg?.text
  const chatId = msg?.chat?.id
  if (!text || chatId == null) return NextResponse.json({ ok: true })

  const m = text.match(/^\/start(?:\s+(\S+))?/)
  if (!m) return NextResponse.json({ ok: true })

  const code = m[1]
  if (!code) {
    await sendTelegramMessage(
      chatId,
      'cafe.pi 앱의 <b>내 정보 → Telegram 알림 연동</b>에서 연동 버튼을 눌러 주세요.',
    )
    return NextResponse.json({ ok: true })
  }

  const userId = verifyLinkCode(code)
  if (!userId) {
    await sendTelegramMessage(
      chatId,
      '⚠️ 연동 링크가 만료되었거나 올바르지 않습니다. 앱에서 다시 시도해 주세요.',
    )
    return NextResponse.json({ ok: true })
  }

  const { data } = await getSupabaseAdmin()
    .from('sys_user')
    .update({
      tlgm_chat_id: chatId,
      tlgm_conn_yn: 'Y',
      tlgm_conn_dtm: new Date().toISOString(),
      modr_id: 'TELEGRAM_BOT',
      mod_dtm: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('id')
    .maybeSingle()

  if (!data) {
    await sendTelegramMessage(
      chatId,
      '⚠️ 사용자를 찾을 수 없습니다. 앱에서 다시 시도해 주세요.',
    )
    return NextResponse.json({ ok: true })
  }

  await sendTelegramMessage(
    chatId,
    '✅ <b>cafe.pi 알림이 연동되었습니다.</b>\n이제 새 주문이 들어오면 여기로 알려드릴게요.',
  )
  return NextResponse.json({ ok: true })
}
