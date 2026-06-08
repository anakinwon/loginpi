import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getOrCreateDirectRoom } from '@/lib/chat'

// GET /api/chat/rooms — 내가 참여 중인 채팅방 목록
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { data: mbrs } = await getSupabaseAdmin()
    .from('msg_room_mbr')
    .select('room_id')
    .eq('usr_id', user.id)
    .eq('del_yn', 'N')

  if (!mbrs || mbrs.length === 0) return NextResponse.json({ rooms: [] })

  const roomIds = mbrs.map((m: { room_id: string }) => m.room_id)

  const { data: rooms, error } = await getSupabaseAdmin()
    .from('msg_room')
    .select(`
      room_id, room_nm, room_desc, theme_cd, room_tp_cd,
      max_mbr_cnt, is_public_yn, del_yn, reg_dtm,
      msg_theme(theme_nm, theme_emoji)
    `)
    .in('room_id', roomIds)
    .eq('del_yn', 'N')
    .order('mod_dtm', { ascending: false })

  if (error) return NextResponse.json({ error: '채팅방 목록 조회 실패' }, { status: 500 })
  return NextResponse.json({ rooms })
}

// POST /api/chat/rooms — 1:1 Direct Room 생성 (TASK-053에서 Group·Event 추가)
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const { target_usr_id } = body as { target_usr_id?: string }
  if (!target_usr_id) {
    return NextResponse.json({ error: 'target_usr_id가 필요합니다' }, { status: 400 })
  }
  if (target_usr_id === user.id) {
    return NextResponse.json({ error: '자기 자신과 채팅방을 만들 수 없습니다' }, { status: 400 })
  }

  // 상대방 존재 확인
  const { data: targetUser } = await getSupabaseAdmin()
    .from('sys_user')
    .select('id')
    .eq('id', target_usr_id)
    .single()

  if (!targetUser) return NextResponse.json({ error: '상대방 사용자를 찾을 수 없습니다' }, { status: 404 })

  try {
    const room = await getOrCreateDirectRoom(user.id, target_usr_id, user.display_name)
    return NextResponse.json({ room }, { status: 201 })
  } catch {
    return NextResponse.json({ error: '채팅방 생성 실패' }, { status: 500 })
  }
}
