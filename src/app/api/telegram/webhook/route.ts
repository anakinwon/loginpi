import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyLinkCode } from '@/lib/telegram-link'
import { sendTelegramMessage } from '@/lib/telegram'

// Telegram webhook — 봇이 받은 업데이트를 처리. 현재는 /start <code> 연동만.
//   보안: setWebhook 시 등록한 secret_token을 헤더로 대조(위조 차단).
//   응답은 항상 200(ok) — Telegram 재시도 폭주 방지(처리 실패는 사용자 안내 메시지로 흡수).

export async function POST(req: NextRequest) {
  // fail-closed — 시크릿 미설정 또는 불일치면 거부. webhook URL이 유일한 인증 경계이므로
  // 시크릿이 없으면 누구나 위조 업데이트를 보낼 수 있다(Telegram 공식 권고: secret_token 필수).
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  const got = req.headers.get('x-telegram-bot-api-secret-token')
  if (!expected || got !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 })
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

  const target = verifyLinkCode(code)
  if (!target) {
    await sendTelegramMessage(
      chatId,
      '⚠️ 연동 링크가 만료되었거나 올바르지 않습니다. 앱에서 다시 시도해 주세요.',
    )
    return NextResponse.json({ ok: true })
  }

  const db = getSupabaseAdmin()
  // 단발성 바인딩 — conn_yn='N' 원자 가드로 "이미 연동된 대상 재바인딩"을 차단한다.
  // 코드가 탈취돼 재생(replay)돼도 이미 연동된 대상은 덮어쓰지 못함(알림 탈취 방지).
  // 텔레그램을 바꾸려면 앱에서 '연동 해제'(conn_yn='N') 후 재연동.
  const now = new Date().toISOString()

  if (target.kind === 'shop') {
    // 매장(mps_shop) 1:1 연동 — 주문 알림이 이 매장 chat_id로 발송됨
    const { data } = await db
      .from('mps_shop')
      .update({
        tlgm_chat_id: chatId,
        tlgm_conn_yn: 'Y',
        tlgm_conn_dtm: now,
        modr_id: 'TELEGRAM_BOT',
        mod_dtm: now,
      })
      .eq('shop_id', target.id)
      .eq('tlgm_conn_yn', 'N')
      .eq('del_yn', 'N')
      .select('shop_id, shop_nm')
      .maybeSingle()

    if (!data) {
      const { data: who } = await db
        .from('mps_shop')
        .select('tlgm_conn_yn')
        .eq('shop_id', target.id)
        .maybeSingle()
      const alreadyBound =
        (who as { tlgm_conn_yn?: string } | null)?.tlgm_conn_yn === 'Y'
      await sendTelegramMessage(
        chatId,
        alreadyBound
          ? '⚠️ 이미 연동된 매장입니다. 변경하려면 앱의 매장 수정에서 연동 해제 후 다시 시도해 주세요.'
          : '⚠️ 매장을 찾을 수 없습니다. 앱에서 다시 시도해 주세요.',
      )
      return NextResponse.json({ ok: true })
    }
    const shopNm = (data as { shop_nm: string | null }).shop_nm ?? '매장'
    await sendTelegramMessage(
      chatId,
      `✅ <b>${shopNm}</b> 주문 알림이 연동되었습니다.\n이제 이 매장에 새 주문이 들어오면 여기로 알려드릴게요.`,
    )
    return NextResponse.json({ ok: true })
  }

  // 사용자(sys_user) 연동 — 기존 동작(폴백 알림·캠페인 등)
  const { data } = await db
    .from('sys_user')
    .update({
      tlgm_chat_id: chatId,
      tlgm_conn_yn: 'Y',
      tlgm_conn_dtm: now,
      tlgm_alrt_cfm_yn: 'Y', // M4: 웰컴 메시지 발송으로 알림 확인 완료
      modr_id: 'TELEGRAM_BOT',
      mod_dtm: now,
    })
    .eq('id', target.id)
    .eq('tlgm_conn_yn', 'N')
    .select('id')
    .maybeSingle()

  if (!data) {
    const { data: who } = await db
      .from('sys_user')
      .select('tlgm_conn_yn')
      .eq('id', target.id)
      .maybeSingle()
    const alreadyBound =
      (who as { tlgm_conn_yn?: string } | null)?.tlgm_conn_yn === 'Y'
    await sendTelegramMessage(
      chatId,
      alreadyBound
        ? '⚠️ 이미 연동되어 있습니다. 변경하려면 앱에서 연동을 해제한 뒤 다시 시도해 주세요.'
        : '⚠️ 사용자를 찾을 수 없습니다. 앱에서 다시 시도해 주세요.',
    )
    return NextResponse.json({ ok: true })
  }

  await sendTelegramMessage(
    chatId,
    '✅ <b>cafe.pi 알림이 연동되었습니다.</b>\n이제 새 주문이 들어오면 여기로 알려드릴게요.',
  )
  return NextResponse.json({ ok: true })
}
