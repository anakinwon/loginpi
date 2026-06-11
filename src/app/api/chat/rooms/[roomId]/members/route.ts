import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getRoomMember } from '@/lib/chat'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type Params = { params: Promise<{ roomId: string }> }

// GET /api/chat/rooms/[roomId]/members — 통화 멤버 피커용 (display_nm 포함)
export async function GET(_req: Request, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr) return NextResponse.json({ error: '카페 멤버가 아닙니다' }, { status: 403 })

  const { data } = await getSupabaseAdmin()
    .from('msg_room_mbr')
    .select('usr_id, sys_user!inner(display_name)')
    .eq('room_id', roomId)
    .eq('del_yn', 'N')

  type Row = { usr_id: string; sys_user: { display_name: string } | null }
  const members = ((data ?? []) as unknown as Row[]).map(r => ({
    usr_id: r.usr_id,
    display_nm: r.sys_user?.display_name ?? r.usr_id.slice(0, 8),
  }))

  return NextResponse.json({ members })
}
