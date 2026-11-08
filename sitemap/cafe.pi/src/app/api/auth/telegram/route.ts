import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createLinkCode } from '@/lib/telegram-link'

// GET — 판매자 Telegram 연동 상태 + 연동 딥링크.
//   getSessionUser()가 쿠키·X-Pi-Token 양쪽을 처리(Pi Browser 호환). null이어도 redirect 금지.
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data } = await getSupabaseAdmin()
    .from('sys_user')
    .select('tlgm_conn_yn')
    .eq('id', user.id)
    .maybeSingle()
  const connected =
    (data as { tlgm_conn_yn?: string } | null)?.tlgm_conn_yn === 'Y'

  const botUser = process.env.TELEGRAM_BOT_USERNAME
  const botConfigured = !!botUser && !!process.env.TELEGRAM_BOT_TOKEN
  const url = botConfigured
    ? `https://t.me/${botUser}?start=${createLinkCode(user.id)}`
    : null

  return NextResponse.json({ connected, botConfigured, url })
}

// DELETE — 연동 해제(chat_id 제거, 발송 대상에서 제외)
export async function DELETE() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  await getSupabaseAdmin()
    .from('sys_user')
    .update({
      tlgm_conn_yn: 'N',
      tlgm_chat_id: null,
      modr_id: user.id,
      mod_dtm: new Date().toISOString(),
    })
    .eq('id', user.id)

  return NextResponse.json({ ok: true })
}
