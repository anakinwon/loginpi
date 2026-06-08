import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getRoom, getRoomMember } from '@/lib/chat'

type Params = { params: Promise<{ roomId: string }> }

// POST /api/chat/rooms/[roomId]/join — 공개 그룹방 입장
// 유료 입장(이벤트방)은 TASK-053 결제 연동 후 처리
export async function POST(request: NextRequest, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const room = await getRoom(roomId)
  if (!room) return NextResponse.json({ error: '채팅방을 찾을 수 없습니다' }, { status: 404 })

  // Direct Room은 join API로 입장 불가 — getOrCreateDirectRoom으로만 생성
  if (room.room_tp_cd === 'D') {
    return NextResponse.json({ error: '1:1 채팅방에는 직접 입장할 수 없습니다' }, { status: 403 })
  }

  // 이벤트방 만료 확인
  if (room.room_tp_cd === 'E' && room.entry_expire_dtm) {
    if (new Date(room.entry_expire_dtm) <= new Date()) {
      return NextResponse.json({ error: '종료된 이벤트입니다' }, { status: 410 })
    }
  }

  // 비공개방은 초대코드 없이 입장 불가 (TASK-053에서 확장)
  if (room.is_public_yn === 'N') {
    return NextResponse.json({ error: '비공개 채팅방입니다' }, { status: 403 })
  }

  // 이미 멤버인지 확인
  const existing = await getRoomMember(roomId, user.id)
  if (existing) return NextResponse.json({ message: '이미 채팅방 멤버입니다' })

  // 정원 확인
  const { count } = await getSupabaseAdmin()
    .from('msg_room_mbr')
    .select('room_mbr_id', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .eq('del_yn', 'N')

  if ((count ?? 0) >= room.max_mbr_cnt) {
    return NextResponse.json({ error: '채팅방 정원이 가득 찼습니다' }, { status: 409 })
  }

  let body: unknown
  try { body = await request.json() } catch { body = {} }
  const { invite_code } = body as { invite_code?: string }
  void invite_code // 추후 초대코드 검증 확장 예정

  const { error } = await getSupabaseAdmin()
    .from('msg_room_mbr')
    .insert({
      room_id: roomId,
      usr_id: user.id,
      mbr_role_cd: 'MEMBER',
      regr_id: user.display_name.slice(0, 20),
      modr_id: user.display_name.slice(0, 20),
    })

  if (error) return NextResponse.json({ error: '입장 실패' }, { status: 500 })
  return NextResponse.json({ message: '입장 성공' }, { status: 201 })
}
