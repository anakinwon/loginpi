import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getRoom, getRoomMember } from '@/lib/chat'
import { apiError } from '@/lib/api-errors'

type Params = { params: Promise<{ roomId: string }> }

// POST /api/chat/rooms/[roomId]/expire — 직거래 문의방 수동 만기 (당사자만).
//   expr_dtm=now로 즉시 만료 → 목록·입장에서 사라짐(listMyRooms `.gt('expr_dtm', now)`·isRoomExpired 공통).
//   직거래방(room_tp_cd='D')만 허용 — 일반/그룹/이벤트방 오작동 방지.
export async function POST(_request: NextRequest, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user) {
    return apiError('AUTH_REQUIRED', 401)
  }

  const [room, mbr] = await Promise.all([
    getRoom(roomId),
    getRoomMember(roomId, user.id),
  ])
  // 당사자(멤버)만 만기 가능
  if (!mbr) {
    return apiError('CHAT_EXPIRE_PARTY_ONLY', 403)
  }
  if (!room || room.room_tp_cd !== 'D') {
    return apiError('CHAT_NOT_DIRECT_DEAL_ROOM', 400)
  }

  await getSupabaseAdmin()
    .from('msg_room')
    .update({
      expr_dtm: new Date().toISOString(),
      modr_id: user.display_name.slice(0, 20),
    })
    .eq('room_id', roomId)

  return NextResponse.json({ ok: true })
}
