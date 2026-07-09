import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { broadcastToCall } from '@/lib/realtime-broadcast'
import {
  getActiveParticipants,
  getActiveParticipant,
  closeCallSessionIfLast,
} from '@/lib/voice'
import { apiError } from '@/lib/api-errors'

type Params = { params: Promise<{ roomId: string }> }

interface LeaveBody {
  rtt_ms?: number
  packet_loss_pct?: number
  jitter_ms?: number
  relay_yn?: 'Y' | 'N'
}

// POST /api/voice/rooms/[roomId]/leave — 음성채널 퇴장 + 품질 메트릭 적재
export async function POST(req: Request, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const participant = await getActiveParticipant(roomId, user.id)
  if (!participant) return apiError('VOICE_NOT_PARTICIPANT', 404)

  const stats = (await req.json().catch(() => ({}))) as LeaveBody
  const supabase = getSupabaseAdmin()
  const now = new Date()
  const durationSec = Math.max(
    0,
    Math.round(
      (now.getTime() - new Date(participant.join_dtm).getTime()) / 1000,
    ),
  )
  const slug = user.display_name.slice(0, 20)

  await supabase
    .from('msg_call_participant')
    .update({
      leave_dtm: now.toISOString(),
      duration_sec: durationSec,
      modr_id: slug,
      mod_dtm: now.toISOString(),
    })
    .eq('participant_id', participant.participant_id)

  // 품질 메트릭 — room+usr 기준 최종 측정값 upsert (getStats 결과 없으면 생략)
  if (
    stats.rtt_ms !== undefined ||
    stats.packet_loss_pct !== undefined ||
    stats.jitter_ms !== undefined
  ) {
    await supabase.from('msg_call_quality_stat').upsert(
      {
        room_id: roomId,
        usr_id: user.id,
        rtt_ms: stats.rtt_ms ?? null,
        packet_loss_pct: stats.packet_loss_pct ?? null,
        jitter_ms: stats.jitter_ms ?? null,
        relay_yn: stats.relay_yn ?? 'N',
        modr_id: slug,
        mod_dtm: now.toISOString(),
      },
      { onConflict: 'room_id,usr_id' },
    )
  }

  const remaining = await getActiveParticipants(roomId)

  // 마지막 퇴장이면 통화 세션 메타 종료 (best-effort)
  await closeCallSessionIfLast(roomId, remaining.length)

  await broadcastToCall(roomId, 'call_participant_leave', {
    usr_id: user.id,
    participants: remaining,
  })

  return NextResponse.json({ success: true, duration_sec: durationSec })
}
