import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { broadcastToCall } from '@/lib/realtime-broadcast'
import {
  VOICE_MAX_MEMBER_SLOTS,
  getActiveParticipants,
  getActiveParticipant,
  countMemberSlots,
  updateMicState,
} from '@/lib/voice'

type Params = { params: Promise<{ roomId: string }> }

// POST /api/voice/rooms/[roomId]/request — 발언(보이스챗) 신청 (R4·R6)
// 청취 전용(LISTEN_ONLY) 참여자가 방장 승인 대기(PENDING)로 전환.
// 멤버 점유 슬롯(CONNECTED+PENDING)이 정원이면 신청 불가.
export async function POST(_req: Request, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const participant = await getActiveParticipant(roomId, user.id)
  if (!participant)
    return NextResponse.json(
      { error: '음성채널 참여 중이 아닙니다' },
      { status: 403 },
    )

  // 이미 송출 중이거나 신청 중이면 멱등 응답
  if (participant.mic_st_cd !== 'LISTEN_ONLY') {
    return NextResponse.json({ mic_st_cd: participant.mic_st_cd })
  }

  const participants = await getActiveParticipants(roomId)
  const { occupied } = countMemberSlots(participants)
  if (occupied >= VOICE_MAX_MEMBER_SLOTS) {
    return NextResponse.json(
      {
        error: `보이스챗 정원(멤버 ${VOICE_MAX_MEMBER_SLOTS}명)이 가득 찼습니다 — 자리가 나면 다시 신청해 주세요`,
      },
      { status: 400 },
    )
  }

  await updateMicState(participant.participant_id, 'PENDING', user.display_name)

  const updated = await getActiveParticipants(roomId)
  // 방장에게 승인 요청 알림 + 전체 상태 동기화
  await broadcastToCall(roomId, 'mic_request', {
    usr_id: user.id,
    display_nm: user.display_name,
    participants: updated,
  })

  return NextResponse.json({ mic_st_cd: 'PENDING' })
}
