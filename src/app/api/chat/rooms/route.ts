import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getOrCreateDirectRoom } from '@/lib/chat'
import { recordActivity } from '@/lib/activity-log'
import { getChatRoomLists } from '@/lib/chat-room-list'
import { apiError } from '@/lib/api-errors'

// GET /api/chat/rooms — 내가 참여 중인 카페 목록 (+?include=public 시 공개 그룹방)
// Pi Browser 클라이언트 게이트(ClientChatList)가 X-Pi-Token 헤더로 호출한다.
// 내 카페·공개 카페 파이프라인 병렬 + Bet 뱃지 1쿼리 — chat-room-list 공통 모듈
export async function GET(request: NextRequest) {
  // 비로그인(게스트)도 공개 카페 목록 조회 가능 (Shop처럼 공개) — 내 카페는 로그인 시만
  const user = await getSessionUser()

  // 카페 화면 진입 = 활성 사용자 신호 (하루 첫 호출만 INSERT, 이후 UPSERT no-op)
  if (user) recordActivity(user.id, 'CHAT')

  const includePublic =
    new URL(request.url).searchParams.get('include') === 'public'

  try {
    const { rooms, publicRooms } = await getChatRoomLists(
      user?.id ?? null,
      includePublic,
    )
    if (!includePublic) return NextResponse.json({ rooms })
    return NextResponse.json({ rooms, publicRooms })
  } catch {
    return apiError('LIST_FAILED', 500)
  }
}

// POST /api/chat/rooms — 1:1 Direct Room 생성 (TASK-053에서 Group·Event 추가)
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }

  const { target_usr_id, item_id } = body as {
    target_usr_id?: string
    item_id?: string
  }
  if (!target_usr_id) {
    return apiError('CHAT_TARGET_REQUIRED', 400)
  }
  if (target_usr_id === user.id) {
    return apiError('CHAT_SELF_ROOM', 400)
  }

  // 상대방 존재 확인
  const { data: targetUser } = await getSupabaseAdmin()
    .from('sys_user')
    .select('id')
    .eq('id', target_usr_id)
    .single()

  if (!targetUser) return apiError('CHAT_TARGET_USER_NOT_FOUND', 404)

  // 상품별 방 분리 — item_id 있으면 상품명 조회 + 판매자 검증(당사자 중 하나가 판매자여야 변조 차단)
  let itemNm: string | null = null
  if (item_id) {
    const { data: item } = await getSupabaseAdmin()
      .from('mps_item')
      .select('item_nm, seller_id')
      .eq('item_id', item_id)
      .maybeSingle()
    const it = item as { item_nm: string; seller_id: string } | null
    if (!it) {
      return apiError('CHAT_PRODUCT_NOT_FOUND', 404)
    }
    if (it.seller_id !== target_usr_id && it.seller_id !== user.id) {
      return apiError('CHAT_SELLER_NOT_PARTY', 400)
    }
    itemNm = it.item_nm
  }

  try {
    const room = await getOrCreateDirectRoom(
      user.id,
      target_usr_id,
      user.display_name,
      item_id ?? null,
      itemNm,
    )
    return NextResponse.json({ room }, { status: 201 })
  } catch {
    return apiError('CHAT_ROOM_CREATE_FAILED', 500)
  }
}
