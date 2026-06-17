import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// 판매자 안읽은 주문 알림 뱃지 — Pull 안전망(Telegram·Realtime 실패해도 앱 열면 보임).
//   GET: 안읽은(viewed_yn='N') 알림 수. 미인증은 0(게이트 위임, redirect 금지).
//   POST: 내 알림 전부 읽음 처리(판매 관리 화면 진입 시 호출).

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ count: 0 })

  const { count } = await getSupabaseAdmin()
    .from('msg_noti_outbox')
    .select('noti_id', { count: 'exact', head: true })
    .eq('recv_usr_id', user.id)
    .eq('viewed_yn', 'N')
    .eq('del_yn', 'N')

  return NextResponse.json({ count: count ?? 0 })
}

export async function POST() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  await getSupabaseAdmin()
    .from('msg_noti_outbox')
    .update({ viewed_yn: 'Y', modr_id: user.id })
    .eq('recv_usr_id', user.id)
    .eq('viewed_yn', 'N')
    .eq('del_yn', 'N')

  return NextResponse.json({ ok: true })
}
