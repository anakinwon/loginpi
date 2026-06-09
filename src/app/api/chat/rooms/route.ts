import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getOrCreateDirectRoom } from '@/lib/chat'
import { recordActivity } from '@/lib/activity-log'

// GET /api/chat/rooms — 내가 참여 중인 채팅방 목록 (+?include=public 시 공개 그룹방)
// Pi Browser 클라이언트 게이트(ClientChatList)가 X-Pi-Token 헤더로 호출한다.
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  // 채팅 화면 진입 = 활성 사용자 신호 (하루 첫 호출만 INSERT, 이후 UPSERT no-op)
  recordActivity(user.id, 'CHAT')

  const includePublic = new URL(request.url).searchParams.get('include') === 'public'

  // 내 채팅방
  const { data: mbrs } = await getSupabaseAdmin()
    .from('msg_room_mbr')
    .select('room_id')
    .eq('usr_id', user.id)
    .eq('del_yn', 'N')

  let rooms: unknown[] = []
  if (mbrs && mbrs.length > 0) {
    const roomIds = mbrs.map((m: { room_id: string }) => m.room_id)
    const [{ data, error }, { data: mbrRows }] = await Promise.all([
      getSupabaseAdmin()
        .from('msg_room')
        .select(`
          room_id, room_nm, room_desc, theme_cd, room_tp_cd,
          max_mbr_cnt, is_public_yn, del_yn, reg_dtm, expr_dtm,
          msg_theme(theme_nm, theme_emoji, theme_tp_cd)
        `)
        .in('room_id', roomIds)
        .eq('del_yn', 'N')
        .order('mod_dtm', { ascending: false }),
      getSupabaseAdmin()
        .from('msg_room_mbr')
        .select('room_id')
        .in('room_id', roomIds)
        .eq('del_yn', 'N'),
    ])
    if (error) return NextResponse.json({ error: '채팅방 목록 조회 실패' }, { status: 500 })
    const cntMap = new Map<string, number>()
    for (const m of mbrRows ?? []) {
      cntMap.set(m.room_id, (cntMap.get(m.room_id) ?? 0) + 1)
    }
    rooms = (data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      cur_mbr_cnt: cntMap.get(r.room_id as string) ?? 0,
    }))
  }

  if (!includePublic) return NextResponse.json({ rooms })

  // 공개 그룹 채팅방 (최근 10개)
  const { data: publicRooms } = await getSupabaseAdmin()
    .from('msg_room')
    .select('room_id, room_nm, theme_cd, room_tp_cd, is_public_yn, max_mbr_cnt, expr_dtm, msg_theme(theme_nm, theme_emoji, theme_tp_cd)')
    .eq('is_public_yn', 'Y')
    .eq('room_tp_cd', 'G')
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })
    .limit(10)

  const pubRoomIds = (publicRooms ?? []).map(r => r.room_id)
  let publicRoomsWithCnt: unknown[] = publicRooms ?? []
  if (pubRoomIds.length > 0) {
    const { data: pubMbrRows } = await getSupabaseAdmin()
      .from('msg_room_mbr')
      .select('room_id')
      .in('room_id', pubRoomIds)
      .eq('del_yn', 'N')
    const pubCntMap = new Map<string, number>()
    for (const m of pubMbrRows ?? []) {
      pubCntMap.set(m.room_id, (pubCntMap.get(m.room_id) ?? 0) + 1)
    }
    publicRoomsWithCnt = (publicRooms ?? []).map(r => ({
      ...r,
      cur_mbr_cnt: pubCntMap.get(r.room_id) ?? 0,
    }))
  }

  return NextResponse.json({ rooms, publicRooms: publicRoomsWithCnt })
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
