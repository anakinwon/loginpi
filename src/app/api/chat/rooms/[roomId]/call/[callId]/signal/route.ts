import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { broadcastToCall } from '@/lib/realtime-broadcast'

type Params = { params: Promise<{ roomId: string; callId: string }> }

const SIGNAL_EVENTS = ['webrtc_offer', 'webrtc_answer', 'webrtc_candidate', 'call_hangup'] as const

const SignalSchema = z.object({
  event: z.enum(SIGNAL_EVENTS),
  payload: z.record(z.string(), z.unknown()),
})

// POST /api/chat/rooms/[roomId]/call/[callId]/signal
// WebRTC 시그널링 메시지 중계 — 서버 broadcastToCall로 신원 보증 후 릴레이
export async function POST(req: Request, { params }: Params) {
  const { roomId, callId } = await params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  // 통화 참여자 검증
  const { data: call } = await getSupabaseAdmin()
    .from('msg_call_log')
    .select('caller_usr_id, callee_usr_id, call_st_cd')
    .eq('call_id', callId)
    .eq('room_id', roomId)
    .eq('del_yn', 'N')
    .maybeSingle()

  if (!call) return NextResponse.json({ error: '통화를 찾을 수 없습니다' }, { status: 404 })

  const isParticipant = call.caller_usr_id === user.id || call.callee_usr_id === user.id
  if (!isParticipant) return NextResponse.json({ error: '통화 참여자가 아닙니다' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }
  const parsed = SignalSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

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

  await broadcastToCall(roomId, event, {
    call_id: callId,
    from_usr_id: user.id,
    ...payload,
  })

  return NextResponse.json({ ok: true })
}
