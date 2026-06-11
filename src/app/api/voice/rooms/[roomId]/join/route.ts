import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getRoomMember } from '@/lib/chat'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { broadcastToCall } from '@/lib/realtime-broadcast'
import {
  MAX_ACTIVE_MICS,
  getActiveParticipants,
  getActiveParticipant,
  openCallSessionIfFirst,
} from '@/lib/voice'

type Params = { params: Promise<{ roomId: string }> }

// POST /api/voice/rooms/[roomId]/join — 음성채널 입장 (1명도 가능, 혼자 대기)
// 활성 마이크 4명 초과 시 청취 전용(mic_yn='N')으로 강제 입장.
export async function POST(_req: Request, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr)
    return NextResponse.json({ error: '카페 멤버가 아닙니다' }, { status: 403 })

  // 이미 입장 중이면 현재 상태 그대로 반환 (중복 join 멱등 처리)
  const existing = await getActiveParticipant(roomId, user.id)
  const participants = await getActiveParticipants(roomId)
  if (existing) {
    return NextResponse.json({ mic_yn: existing.mic_yn, participants })
  }

  const activeMicCount = participants.filter((p) => p.mic_yn === 'Y').length
  const micYn: 'Y' | 'N' = activeMicCount >= MAX_ACTIVE_MICS ? 'N' : 'Y'

  // 첫 참여자면 통화 세션 메타 시작 (best-effort)
  await openCallSessionIfFirst(roomId, participants.length)

  const slug = user.display_name.slice(0, 20)
  const { error } = await getSupabaseAdmin()
    .from('msg_call_participant')
    .insert({
      room_id: roomId,
      usr_id: user.id,
      mic_yn: micYn,
      regr_id: slug,
      modr_id: slug,
    })
  if (error) {
    // 동시 join 경쟁으로 활성 unique 충돌 — 멱등 처리
    const retry = await getActiveParticipant(roomId, user.id)
    if (retry) {
      return NextResponse.json({
        mic_yn: retry.mic_yn,
        participants: await getActiveParticipants(roomId),
      })
    }
    return NextResponse.json({ error: '음성채널 입장 실패' }, { status: 500 })
  }

  const updated = await getActiveParticipants(roomId)

  // 기존 참여자들에게 새 입장자 알림 — 신규 입장자가 각 기존 피어에게 offer를 보낸다
  await broadcastToCall(roomId, 'call_participant_join', {
    usr_id: user.id,
    display_nm: user.display_name,
    mic_yn: micYn,
    participants: updated,
  })

  return NextResponse.json({ mic_yn: micYn, participants: updated })
}
