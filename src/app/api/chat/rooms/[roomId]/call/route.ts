import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth-check'
import { getRoomMember } from '@/lib/chat'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { broadcastToCall } from '@/lib/realtime-broadcast'
import { recordUserAction } from '@/lib/event'

type Params = { params: Promise<{ roomId: string }> }

const StartCallSchema = z.object({
  callee_usr_id: z.string().uuid(),
})

// POST /api/chat/rooms/[roomId]/call — 1:1 통화 발신
export async function POST(req: Request, { params }: Params) {
  const { roomId } = await params
  const caller = await getSessionUser()
  if (!caller)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const mbr = await getRoomMember(roomId, caller.id)
  if (!mbr)
    return NextResponse.json({ error: '카페 멤버가 아닙니다' }, { status: 403 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }
  const parsed = StartCallSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { callee_usr_id } = parsed.data
  if (callee_usr_id === caller.id) {
    return NextResponse.json(
      { error: '자기 자신에게 통화할 수 없습니다' },
      { status: 400 },
    )
  }

  const calleeMbr = await getRoomMember(roomId, callee_usr_id)
  if (!calleeMbr)
    return NextResponse.json(
      { error: '수신자가 카페 멤버가 아닙니다' },
      { status: 403 },
    )

  // 이미 RINGING 상태인 활성 통화가 있으면 거부 (동시 통화 1건 제한)
  const { data: active } = await getSupabaseAdmin()
    .from('msg_call_log')
    .select('call_id')
    .eq('room_id', roomId)
    .eq('call_st_cd', 'RINGING')
    .eq('del_yn', 'N')
    .maybeSingle()

  if (active)
    return NextResponse.json(
      { error: '이미 진행 중인 통화가 있습니다' },
      { status: 409 },
    )

  const { data: call, error } = await getSupabaseAdmin()
    .from('msg_call_log')
    .insert({
      room_id: roomId,
      caller_usr_id: caller.id,
      callee_usr_id,
      call_st_cd: 'RINGING',
      regr_id: caller.id,
      modr_id: caller.id,
    })
    .select('call_id')
    .single()

  if (error)
    return NextResponse.json({ error: '통화 생성 실패' }, { status: 500 })

  await broadcastToCall(roomId, 'call_invite', {
    call_id: call.call_id,
    caller_usr_id: caller.id,
    caller_nm: caller.display_name,
    callee_usr_id,
  })

  // M6: 음성채팅 이용 미션 기록 (비블로킹) — MULTI_OR 중 1개
  // 레거시 1:1 통화 경로. N:N 음성채널은 voice/rooms/[roomId]/join에서 별도 기록.
  // 둘 다 voice_join을 기록해 어떤 경로로 입장해도 M6가 누락되지 않게 한다.
  recordUserAction('voice_join', caller.id, { roomId, call_id: call.call_id })
    .catch(err => console.error(`[M6-voice] 미션 기록 실패: ${err.message}`))

  return NextResponse.json({ call_id: call.call_id })
}
