import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getRoomMember } from '@/lib/chat'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { broadcastToCall } from '@/lib/realtime-broadcast'
import {
  getActiveParticipants,
  getActiveParticipant,
  decideMicStateOnJoin,
  openCallSessionIfFirst,
} from '@/lib/voice'
import { recordUserAction } from '@/lib/event'

type Params = { params: Promise<{ roomId: string }> }

// POST /api/voice/rooms/[roomId]/join — 음성채널 입장 (1명도 가능, 혼자 대기)
// v3.0 권한 정책: 방장 무조건 CONNECTED(R1), 멤버 자동 슬롯 2(R3),
// 초과분은 PENDING 승인 대기(R4), 멤버 정원 4 초과 시 청취 전용(R6)
export async function POST(_req: Request, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr)
    return NextResponse.json({ error: '카페 멤버가 아닙니다' }, { status: 403 })

  const isOwner = mbr.mbr_role_cd === 'OWNER' || mbr.mbr_role_cd === 'ADMIN'

  // 이미 입장 중이면 현재 상태 그대로 반환 (중복 join 멱등 처리)
  const existing = await getActiveParticipant(roomId, user.id)
  const participants = await getActiveParticipants(roomId)
  if (existing) {
    return NextResponse.json({
      mic_yn: existing.mic_yn,
      mic_st_cd: existing.mic_st_cd,
      participants,
    })
  }

  const micState = decideMicStateOnJoin(isOwner, participants)

  // 첫 참여자면 통화 세션 메타 시작 (best-effort)
  await openCallSessionIfFirst(roomId, participants.length)

  const slug = user.display_name.slice(0, 20)
  const { error } = await getSupabaseAdmin()
    .from('msg_call_participant')
    .insert({
      room_id: roomId,
      usr_id: user.id,
      mic_yn: micState === 'CONNECTED' ? 'Y' : 'N',
      mic_st_cd: micState,
      regr_id: slug,
      modr_id: slug,
    })
  if (error) {
    // 동시 join 경쟁으로 활성 unique 충돌 — 멱등 처리
    const retry = await getActiveParticipant(roomId, user.id)
    if (retry) {
      return NextResponse.json({
        mic_yn: retry.mic_yn,
        mic_st_cd: retry.mic_st_cd,
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
    mic_yn: micState === 'CONNECTED' ? 'Y' : 'N',
    mic_st_cd: micState,
    participants: updated,
  })

  // PENDING 입장이면 방장에게 승인 요청 알림 (R4)
  if (micState === 'PENDING') {
    await broadcastToCall(roomId, 'mic_request', {
      usr_id: user.id,
      display_nm: user.display_name,
      participants: updated,
    })
  }

  // M6: 음성채널 입장 미션 기록 (현행 N:N 입장 경로).
  // 레거시 1:1 call route에만 있던 voice_join을 본 경로에도 심어, 음성채널만 이용한
  // 사용자가 M6(voice_join/file_send/sticker_use 중 1개)에서 누락되지 않게 한다.
  recordUserAction('voice_join', user.id, { roomId })

  return NextResponse.json({
    mic_yn: micState === 'CONNECTED' ? 'Y' : 'N',
    mic_st_cd: micState,
    participants: updated,
  })
}
