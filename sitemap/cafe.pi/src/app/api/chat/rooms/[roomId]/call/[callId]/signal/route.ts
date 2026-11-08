import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { broadcastToCall } from '@/lib/realtime-broadcast'
import { apiError } from '@/lib/api-errors'

type Params = { params: Promise<{ roomId: string; callId: string }> }

const SIGNAL_EVENTS = [
  'webrtc_offer',
  'webrtc_answer',
  'webrtc_candidate',
  'call_hangup',
] as const

const SignalSchema = z.object({
  event: z.enum(SIGNAL_EVENTS),
  payload: z.record(z.string(), z.unknown()),
})

// POST /api/chat/rooms/[roomId]/call/[callId]/signal
// WebRTC 시그널링 메시지 중계 — 서버 broadcastToCall로 신원 보증 후 릴레이
export async function POST(req: Request, { params }: Params) {
  const { roomId, callId } = await params
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  // 통화 참여자 검증
  const { data: call } = await getSupabaseAdmin()
    .from('msg_call_log')
    .select('caller_usr_id, callee_usr_id, call_st_cd')
    .eq('call_id', callId)
    .eq('room_id', roomId)
    .eq('del_yn', 'N')
    .maybeSingle()

  if (!call) return apiError('CHAT_CALL_NOT_FOUND', 404)

  const isParticipant =
    call.caller_usr_id === user.id || call.callee_usr_id === user.id
  if (!isParticipant) return apiError('CHAT_CALL_NOT_PARTICIPANT', 403)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }
  const parsed = SignalSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { event, payload } = parsed.data

  // offer 수신 시 RINGING → CONNECTED 상태 전이
  if (event === 'webrtc_answer') {
    await getSupabaseAdmin()
      .from('msg_call_log')
      .update({
        call_st_cd: 'CONNECTED',
        start_dtm: new Date().toISOString(),
        modr_id: user.id,
        mod_dtm: new Date().toISOString(),
      })
      .eq('call_id', callId)
      .eq('call_st_cd', 'RINGING')
  }

  // 신원 키(call_id, from_usr_id)는 클라이언트 payload에서 제거하고 서버 검증값으로 덮어쓴다.
  // 스프레드를 먼저 펼친 뒤 서버 주입 필드를 마지막에 둬야 위장(spoofing)을 막을 수 있다.
  const {
    call_id: _ignoredCallId,
    from_usr_id: _ignoredFrom,
    ...safePayload
  } = payload
  await broadcastToCall(roomId, event, {
    ...safePayload,
    call_id: callId,
    from_usr_id: user.id,
  })

  return NextResponse.json({ ok: true })
}
