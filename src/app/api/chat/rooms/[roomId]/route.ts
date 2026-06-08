import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getRoom, getRoomMember } from '@/lib/chat'

type Params = { params: Promise<{ roomId: string }> }

// GET /api/chat/rooms/[roomId] — 채팅방 상세 + 멤버 목록
export async function GET(_request: Request, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const [room, mbr] = await Promise.all([
    getRoom(roomId),
    getRoomMember(roomId, user.id),
  ])

  if (!room) return NextResponse.json({ error: '채팅방을 찾을 수 없습니다' }, { status: 404 })
  if (!mbr) return NextResponse.json({ error: '채팅방 멤버가 아닙니다' }, { status: 403 })

  const { data: members } = await getSupabaseAdmin()
    .from('msg_room_mbr')
    .select('room_mbr_id, usr_id, mbr_role_cd, lst_read_msg_id, expire_dtm, reg_dtm')
    .eq('room_id', roomId)
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: true })

  return NextResponse.json({ room, members: members ?? [], myRole: mbr.mbr_role_cd })
}
