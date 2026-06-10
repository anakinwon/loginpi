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
    // 공개 그룹방·이벤트방이면 클라이언트가 입장 CTA를 보여줄 수 있도록 방 미리보기 포함
    // 이벤트방(E)은 entry_fee_pi를 함께 내려 결제 후 입장(Trigger 8) UI를 띄울 수 있게 한다
    if ((room.room_tp_cd === 'G' || room.room_tp_cd === 'E') && room.is_public_yn === 'Y') {
      // 종료된 이벤트방은 입장 불가
      if (room.room_tp_cd === 'E' && room.entry_expire_dtm && new Date(room.entry_expire_dtm) <= new Date()) {
        return NextResponse.json({ error: '종료된 이벤트방입니다' }, { status: 403 })
      }
      return NextResponse.json(
        {
          error: '채팅방 멤버가 아닙니다',
          isPublic: true,
          room: {
            room_nm: room.room_nm,
            theme_cd: room.theme_cd,
            room_tp_cd: room.room_tp_cd,
            entry_fee_pi: room.entry_fee_pi,
            entry_expire_dtm: room.entry_expire_dtm,
          },
        },
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
