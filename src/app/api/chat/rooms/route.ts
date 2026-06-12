import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getOrCreateDirectRoom } from '@/lib/chat'
import { recordActivity } from '@/lib/activity-log'
import { getChatRoomLists } from '@/lib/chat-room-list'

// GET /api/chat/rooms — 내가 참여 중인 카페 목록 (+?include=public 시 공개 그룹방)
// Pi Browser 클라이언트 게이트(ClientChatList)가 X-Pi-Token 헤더로 호출한다.
// 내 카페·공개 카페 파이프라인 병렬 + Bet 뱃지 1쿼리 — chat-room-list 공통 모듈
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  // 카페 화면 진입 = 활성 사용자 신호 (하루 첫 호출만 INSERT, 이후 UPSERT no-op)
  recordActivity(user.id, 'CHAT')

  const includePublic =
    new URL(request.url).searchParams.get('include') === 'public'

  try {
    const { rooms, publicRooms } = await getChatRoomLists(
      user.id,
      includePublic,
    )
    if (!includePublic) return NextResponse.json({ rooms })
    return NextResponse.json({ rooms, publicRooms })
  } catch {
    return NextResponse.json({ error: '카페 목록 조회 실패' }, { status: 500 })
  }
}

// POST /api/chat/rooms — 1:1 Direct Room 생성 (TASK-053에서 Group·Event 추가)
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const { target_usr_id } = body as { target_usr_id?: string }
  if (!target_usr_id) {
    return NextResponse.json(
      { error: 'target_usr_id가 필요합니다' },
      { status: 400 },
    )
  }
  if (target_usr_id === user.id) {
    return NextResponse.json(
      { error: '자기 자신과 카페를 만들 수 없습니다' },
      { status: 400 },
    )
  }

  // 상대방 존재 확인
  const { data: targetUser } = await getSupabaseAdmin()
    .from('sys_user')
    .select('id')
    .eq('id', target_usr_id)
    .single()

  if (!targetUser)
    return NextResponse.json(
      { error: '상대방 사용자를 찾을 수 없습니다' },
      { status: 404 },
    )

  try {
    const room = await getOrCreateDirectRoom(
      user.id,
      target_usr_id,
      user.display_name,
    )
    return NextResponse.json({ room }, { status: 201 })
  } catch {
    return NextResponse.json({ error: '카페 생성 실패' }, { status: 500 })
  }
}
