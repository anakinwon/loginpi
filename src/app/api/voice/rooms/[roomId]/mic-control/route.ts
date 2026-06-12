import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getRoomMember } from '@/lib/chat'
import { broadcastToCall } from '@/lib/realtime-broadcast'
import {
  VOICE_MAX_MEMBER_SLOTS,
  getActiveParticipants,
  getActiveParticipant,
  countMemberSlots,
  updateMicState,
  type MicState,
} from '@/lib/voice'

type Params = { params: Promise<{ roomId: string }> }

// v3.0 방장 액션 (R4·R5):
//  approve — PENDING → CONNECTED (승인)
//  deny    — PENDING → LISTEN_ONLY (거절)
//  revoke  — CONNECTED → LISTEN_ONLY (권한 회수 — 언제든 가능)
//  grant   — LISTEN_ONLY → CONNECTED (방장 직접 허용)
// 하위 호환: mute → revoke, unmute → grant
type MicAction = 'approve' | 'deny' | 'revoke' | 'grant' | 'mute' | 'unmute'

interface MicControlBody {
  target_usr_id: string
  action: MicAction
}

const ACTION_ALIAS: Record<string, 'approve' | 'deny' | 'revoke' | 'grant'> = {
  approve: 'approve',
  deny: 'deny',
  revoke: 'revoke',
  grant: 'grant',
  mute: 'revoke',
  unmute: 'grant',
}

// POST /api/voice/rooms/[roomId]/mic-control — 방장(OWNER/ADMIN) 보이스챗 권한 제어
export async function POST(req: Request, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  // 방장 권한 검증 — OWNER 또는 ADMIN만 제어 가능
  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr || (mbr.mbr_role_cd !== 'OWNER' && mbr.mbr_role_cd !== 'ADMIN')) {
    return NextResponse.json(
      { error: '방장만 보이스챗 권한을 제어할 수 있습니다' },
      { status: 403 },
    )
  }

  const body = (await req.json().catch(() => null)) as MicControlBody | null
  const action = body?.action ? ACTION_ALIAS[body.action] : undefined
  if (!body?.target_usr_id || !action) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const target = await getActiveParticipant(roomId, body.target_usr_id)
  if (!target)
    return NextResponse.json(
      { error: '음성채널에 없는 참여자입니다' },
      { status: 404 },
    )

  // 상태 전이 검증 + 송출 허용(approve/grant) 시 멤버 CONNECTED 정원 재확인
  let nextState: MicState
  if (action === 'approve' || action === 'grant') {
    const participants = await getActiveParticipants(roomId)
    const targetRow = participants.find((p) => p.usr_id === body.target_usr_id)
    // 방장 대상이면 정원 무관 CONNECTED (R1)
    if (targetRow?.owner_yn !== 'Y') {
      const { connected } = countMemberSlots(participants)
      // 본인이 이미 CONNECTED면 멱등 — 카운트에서 제외할 필요 없음 (아래서 그대로 CONNECTED)
      if (target.mic_st_cd !== 'CONNECTED' && connected >= VOICE_MAX_MEMBER_SLOTS) {
        return NextResponse.json(
          { error: `동시 보이스챗은 멤버 최대 ${VOICE_MAX_MEMBER_SLOTS}명까지입니다` },
          { status: 400 },
        )
      }
    }
    nextState = 'CONNECTED'
  } else {
    // deny·revoke → 청취 전용 (R5: 언제든 회수 가능)
    nextState = 'LISTEN_ONLY'
  }

  await updateMicState(target.participant_id, nextState, user.display_name)

  const updated = await getActiveParticipants(roomId)
  // 단일 이벤트로 상태 전파 — 클라이언트는 target이 본인이면 트랙 동기화
  await broadcastToCall(roomId, 'mic_st_change', {
    target_usr_id: body.target_usr_id,
    mic_st_cd: nextState,
    action,
    requested_by: user.id,
    participants: updated,
  })

  return NextResponse.json({ success: true, mic_st_cd: nextState })
}
