import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getRoomMember, getRecentMsgCount } from '@/lib/chat'

type Params = { params: Promise<{ roomId: string }> }

// GET /api/chat/rooms/[roomId]/messages?limit=50&before=<msg_id>
// cursor 기반 페이지네이션 — scroll-up 무한로드
export async function GET(request: NextRequest, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr) return NextResponse.json({ error: '채팅방 멤버가 아닙니다' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 100)
  const before = searchParams.get('before') // msg_id cursor

  let query = getSupabaseAdmin()
    .from('msg_msg')
    .select('msg_id, room_id, snd_usr_id, snd_usr_nm, msg_cont, msg_tp_cd, attch_url, stkr_id, ref_msg_id, del_yn, reg_dtm')
    .eq('room_id', roomId)
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })
    .limit(limit)

  // cursor 이전 메시지만 조회 (scroll-up 방향)
  if (before) {
    const { data: cursorMsg } = await getSupabaseAdmin()
      .from('msg_msg')
      .select('reg_dtm')
      .eq('msg_id', before)
      .single()
    if (cursorMsg) {
      query = query.lt('reg_dtm', cursorMsg.reg_dtm)
    }
  }

  const { data: messages, error } = await query

  if (error) return NextResponse.json({ error: '메시지 조회 실패' }, { status: 500 })

  const reversed = (messages ?? []).reverse()
  const hasMore = (messages ?? []).length === limit
  const oldestMsgId = reversed[0]?.msg_id ?? null

  return NextResponse.json({ messages: reversed, hasMore, oldestMsgId })
}

// POST /api/chat/rooms/[roomId]/messages — 메시지 전송
export async function POST(request: NextRequest, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr) return NextResponse.json({ error: '채팅방 멤버가 아닙니다' }, { status: 403 })

  // rate limiting: 1초 5건 초과 방지
  const recentCount = await getRecentMsgCount(roomId, user.id)
  if (recentCount >= 5) {
    return NextResponse.json({ error: '너무 빠르게 메시지를 전송하고 있습니다' }, { status: 429 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const { msg_cont, msg_tp_cd = 'TEXT', ref_msg_id, stkr_id } = body as {
    msg_cont?: string
    msg_tp_cd?: string
    ref_msg_id?: string
    stkr_id?: string
  }

  if (msg_tp_cd === 'TEXT' && !msg_cont?.trim()) {
    return NextResponse.json({ error: '메시지 내용을 입력해주세요' }, { status: 400 })
  }

  const validTypes = ['TEXT', 'IMAGE', 'FILE', 'VOICE', 'STICKER', 'SYSTEM']
  if (!validTypes.includes(msg_tp_cd)) {
    return NextResponse.json({ error: '유효하지 않은 메시지 타입' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('msg_msg')
    .insert({
      room_id: roomId,
      snd_usr_id: user.id,
      snd_usr_nm: user.display_name,
      msg_cont: msg_cont?.trim() ?? null,
      msg_tp_cd,
      ref_msg_id: ref_msg_id ?? null,
      stkr_id: stkr_id ?? null,
      regr_id: user.display_name.slice(0, 20),
      modr_id: user.display_name.slice(0, 20),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: '메시지 전송 실패' }, { status: 500 })

  // 채팅방 mod_dtm 갱신 (최근 메시지 기준 정렬용)
  await getSupabaseAdmin()
    .from('msg_room')
    .update({ modr_id: user.display_name.slice(0, 20) })
    .eq('room_id', roomId)

  return NextResponse.json({ message: data }, { status: 201 })
}
