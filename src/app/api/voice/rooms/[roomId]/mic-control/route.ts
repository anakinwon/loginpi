import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getRoomMember } from '@/lib/chat'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { broadcastToCall } from '@/lib/realtime-broadcast'
import {
  MAX_ACTIVE_MICS,
  getActiveParticipants,
  getActiveParticipant,
} from '@/lib/voice'

type Params = { params: Promise<{ roomId: string }> }

interface MicControlBody {
  target_usr_id: string
  action: 'mute' | 'unmute'
}

// POST /api/voice/rooms/[roomId]/mic-control — 방장(OWNER/ADMIN) 마이크 원격 강제 제어
export async function POST(req: Request, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  // 방장 권한 검증 — OWNER 또는 ADMIN만 제어 가능
  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr || (mbr.mbr_role_cd !== 'OWNER' && mbr.mbr_role_cd !== 'ADMIN')) {
    return NextResponse.json(
      { error: '방장만 마이크를 제어할 수 있습니다' },
      { status: 403 },
    )
  }

  const body = (await req.json().catch(() => null)) as MicControlBody | null
  if (
    !body?.target_usr_id ||
    (body.action !== 'mute' && body.action !== 'unmute')
  ) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const target = await getActiveParticipant(roomId, body.target_usr_id)
  if (!target)
    return NextResponse.json(
      { error: '음성채널에 없는 참여자입니다' },
      { status: 404 },
    )

  // unmute 시 동시 마이크 4명 상한 재확인 (서버 강제)
  if (body.action === 'unmute' && target.mic_yn === 'N') {
    const participants = await getActiveParticipants(roomId)
    const activeMicCount = participants.filter((p) => p.mic_yn === 'Y').length
    if (activeMicCount >= MAX_ACTIVE_MICS) {
      return NextResponse.json(
        { error: `동시 마이크는 최대 ${MAX_ACTIVE_MICS}명까지입니다` },
        { status: 400 },
      )
    }
  }

  const micYn: 'Y' | 'N' = body.action === 'mute' ? 'N' : 'Y'
  await getSupabaseAdmin()
    .from('msg_call_participant')
    .update({
      mic_yn: micYn,
      modr_id: user.display_name.slice(0, 20),
      mod_dtm: new Date().toISOString(),
    })
    .eq('participant_id', target.participant_id)

  const updated = await getActiveParticipants(roomId)
  await broadcastToCall(
    roomId,
    body.action === 'mute' ? 'mic_mute_force' : 'mic_unmute_allow',
    {
      target_usr_id: body.target_usr_id,
      requested_by: user.id,
      participants: updated,
    },
  )

  return NextResponse.json({ success: true, mic_yn: micYn })
}
