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
  if (!mbr) {
    // 공개 그룹방이면 클라이언트가 입장 CTA를 보여줄 수 있도록 방 미리보기 포함
    if (room.room_tp_cd === 'G' && room.is_public_yn === 'Y') {
      return NextResponse.json(
        { error: '채팅방 멤버가 아닙니다', isPublic: true, room: { room_nm: room.room_nm, theme_cd: room.theme_cd } },
        { status: 403 }
      )
    }
    return NextResponse.json({ error: '채팅방 멤버가 아닙니다' }, { status: 403 })
  }

  // 테마 이모지 — 클라이언트 게이트(ClientChatRoom) 헤더 렌더용
  const { data: theme } = await getSupabaseAdmin()
    .from('msg_theme')
    .select('theme_emoji')
    .eq('theme_cd', room.theme_cd)
    .single()
  const themeEmoji = (theme as { theme_emoji?: string } | null)?.theme_emoji ?? '💬'

  const { data: members } = await getSupabaseAdmin()
    .from('msg_room_mbr')
    .select('room_mbr_id, usr_id, mbr_role_cd, lst_read_msg_id, expire_dtm, reg_dtm')
    .eq('room_id', roomId)
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: true })

  return NextResponse.json({ room, themeEmoji, members: members ?? [], myRole: mbr.mbr_role_cd })
}
