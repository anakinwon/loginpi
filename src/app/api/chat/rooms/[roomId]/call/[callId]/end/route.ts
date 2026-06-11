import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { broadcastToCall } from '@/lib/realtime-broadcast'

type Params = { params: Promise<{ roomId: string; callId: string }> }

const EndCallSchema = z.object({
  end_rsn_cd: z
    .enum(['USER_ENDED', 'TIMEOUT', 'REJECTED', 'FAILED'])
    .optional(),
  relay_yn: z.enum(['Y', 'N']).optional(),
  // pc.getStats() 수집값 — 종료 시 함께 적재
  rtt_ms: z.number().int().nonnegative().optional(),
  packet_loss_pct: z.number().nonnegative().max(100).optional(),
  jitter_ms: z.number().nonnegative().optional(),
})

// POST /api/chat/rooms/[roomId]/call/[callId]/end — 통화 종료 + 품질 기록
export async function POST(req: Request, { params }: Params) {
  const { roomId, callId } = await params
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { data: call } = await getSupabaseAdmin()
    .from('msg_call_log')
    .select('caller_usr_id, callee_usr_id, call_st_cd, start_dtm')
    .eq('call_id', callId)
    .eq('room_id', roomId)
    .eq('del_yn', 'N')
    .maybeSingle()

  if (!call)
    return NextResponse.json(
      { error: '통화를 찾을 수 없습니다' },
      { status: 404 },
    )

  const isParticipant =
    call.caller_usr_id === user.id || call.callee_usr_id === user.id
  if (!isParticipant)
    return NextResponse.json(
      { error: '통화 참여자가 아닙니다' },
      { status: 403 },
    )

  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const parsed = EndCallSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const {
    end_rsn_cd = 'USER_ENDED',
    relay_yn,
    rtt_ms,
    packet_loss_pct,
    jitter_ms,
  } = parsed.data

  const endDtm = new Date()
  const durationSec = call.start_dtm
    ? Math.round((endDtm.getTime() - new Date(call.start_dtm).getTime()) / 1000)
    : null

  // DECLINED: 수신자가 ringing 중 거절, MISSED: 발신자 기준 timeout
  const finalStatus =
    call.call_st_cd === 'RINGING'
      ? end_rsn_cd === 'REJECTED'
        ? 'DECLINED'
        : 'MISSED'
      : 'ENDED'

  await getSupabaseAdmin()
    .from('msg_call_log')
    .update({
      call_st_cd: finalStatus,
      end_dtm: endDtm.toISOString(),
      duration_sec: durationSec,
      end_rsn_cd,
      ...(relay_yn ? { relay_yn } : {}),
      modr_id: user.id,
      mod_dtm: endDtm.toISOString(),
    })
    .eq('call_id', callId)

  // 품질 메트릭이 있으면 적재 (CONNECTED 상태에서만 의미 있음)
  if (
    call.call_st_cd === 'CONNECTED' &&
    (rtt_ms !== undefined ||
      packet_loss_pct !== undefined ||
      jitter_ms !== undefined)
  ) {
    await getSupabaseAdmin()
      .from('msg_call_quality_stat')
      .upsert(
        {
          call_id: callId,
          usr_id: user.id,
          rtt_ms: rtt_ms ?? null,
          packet_loss_pct: packet_loss_pct ?? null,
          jitter_ms: jitter_ms ?? null,
          relay_yn: relay_yn ?? 'N',
          regr_id: user.id,
          modr_id: user.id,
        },
        { onConflict: 'call_id,usr_id' },
      )
  }

  await broadcastToCall(roomId, 'call_hangup', {
    call_id: callId,
    from_usr_id: user.id,
    end_rsn_cd,
  })

  return NextResponse.json({ ok: true, duration_sec: durationSec })
}
