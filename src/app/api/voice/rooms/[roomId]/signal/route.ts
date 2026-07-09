import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { broadcastToCall } from '@/lib/realtime-broadcast'
import { getActiveParticipant } from '@/lib/voice'
import { apiError } from '@/lib/api-errors'

type Params = { params: Promise<{ roomId: string }> }

const SIGNAL_EVENTS = [
  'webrtc_offer',
  'webrtc_answer',
  'webrtc_candidate',
] as const
type SignalEvent = (typeof SIGNAL_EVENTS)[number]

interface SignalBody {
  event: SignalEvent
  to_usr_id: string
  payload: { sdp?: unknown; candidate?: unknown }
}

// POST /api/voice/rooms/[roomId]/signal — WebRTC SDP/ICE 시그널 중계 (피어 지정)
// 서버 broadcastToCall 경유로 from_usr_id 신원 보증 (클라 직접 broadcast 금지)
export async function POST(req: Request, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  // 음성채널 활성 참여자만 시그널 송신 가능
  const participant = await getActiveParticipant(roomId, user.id)
  if (!participant) return apiError('VOICE_NOT_PARTICIPANT', 403)

  const body = (await req.json().catch(() => null)) as SignalBody | null
  if (!body || !SIGNAL_EVENTS.includes(body.event) || !body.to_usr_id) {
    return apiError('VOICE_INVALID_SIGNAL', 400)
  }

  await broadcastToCall(roomId, body.event, {
    from_usr_id: user.id,
    to_usr_id: body.to_usr_id,
    ...body.payload,
  })

  return NextResponse.json({ success: true })
}
