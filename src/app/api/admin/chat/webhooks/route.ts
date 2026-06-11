import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser, isAdmin } from '@/lib/auth-check'

// TASK-072: 어드민 — 전체 Webhook 등록 현황 (api_key 마스킹)
// GET /api/admin/chat/webhooks
export async function GET() {
  const user = await getSessionUser()
  if (!isAdmin(user))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await getSupabaseAdmin()
    .from('msg_webhook')
    .select(
      'webhook_id, room_id, usr_id, bot_nm, webhook_url, api_key, use_yn, reg_dtm, msg_room(room_nm)',
    )
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })

  if (error)
    return NextResponse.json(
      { error: 'Webhook 목록 조회 실패' },
      { status: 500 },
    )

  const webhooks = (data ?? []).map(
    (w: { api_key: string } & Record<string, unknown>) => ({
      ...w,
      api_key: `${w.api_key.slice(0, 8)}…`,
    }),
  )
  return NextResponse.json({ webhooks })
}
