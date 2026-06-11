import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { broadcastToRoom } from '@/lib/realtime-broadcast'

// TASK-072: 봇 메시지 전송 API (API Key 기반 — 세션 불필요)
// POST /api/chat/bot/messages
// Headers: Authorization: Bot <api_key>
// Body: { msg_cont: string }
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? ''
  const match = /^Bot\s+(\S+)$/i.exec(auth)
  if (!match) {
    return NextResponse.json(
      { error: 'Authorization: Bot <api_key> 헤더가 필요합니다' },
      { status: 401 },
    )
  }
  const apiKey = match[1]

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }
  const msgCont = String((body as { msg_cont?: string }).msg_cont ?? '').trim()
  if (!msgCont || msgCont.length > 2000) {
    return NextResponse.json(
      { error: '메시지 내용(2000자 이내)을 입력해주세요' },
      { status: 400 },
    )
  }

  const db = getSupabaseAdmin()
  const { data: hook } = await db
    .from('msg_webhook')
    .select('webhook_id, room_id, usr_id, bot_nm')
    .eq('api_key', apiKey)
    .eq('use_yn', 'Y')
    .eq('del_yn', 'N')
    .maybeSingle()

  if (!hook)
    return NextResponse.json(
      { error: '유효하지 않은 API Key' },
      { status: 401 },
    )

  const hookRow = hook as {
    webhook_id: string
    room_id: string
    usr_id: string
    bot_nm: string
  }

  // rate limit: 봇당 최근 1분 30건 제한
  const since = new Date(Date.now() - 60_000).toISOString()
  const { count } = await db
    .from('msg_msg')
    .select('msg_id', { count: 'exact', head: true })
    .eq('room_id', hookRow.room_id)
    .eq('snd_usr_nm', hookRow.bot_nm)
    .gte('reg_dtm', since)
    .eq('del_yn', 'N')
  if ((count ?? 0) >= 30) {
    return NextResponse.json(
      { error: '봇 메시지 전송 한도 초과 (분당 30건)' },
      { status: 429 },
    )
  }

  const { data: msg, error } = await db
    .from('msg_msg')
    .insert({
      room_id: hookRow.room_id,
      snd_usr_id: hookRow.usr_id, // FK 안전 — 등록자 ID 사용
      snd_usr_nm: hookRow.bot_nm,
      msg_cont: msgCont,
      msg_tp_cd: 'TEXT',
      regr_id: 'BOT',
      modr_id: 'BOT',
    })
    .select()
    .single()

  if (error || !msg)
    return NextResponse.json({ error: '봇 메시지 전송 실패' }, { status: 500 })

  await broadcastToRoom(hookRow.room_id, 'new_msg', msg)
  return NextResponse.json({ message: msg }, { status: 201 })
}
