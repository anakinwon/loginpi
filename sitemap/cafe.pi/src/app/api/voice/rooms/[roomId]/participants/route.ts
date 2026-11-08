import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getRoomMember } from '@/lib/chat'
import { getActiveParticipants } from '@/lib/voice'
import { apiError } from '@/lib/api-errors'

type Params = { params: Promise<{ roomId: string }> }

// GET /api/voice/rooms/[roomId]/participants — 음성채널 현재 참여자 (입장 전 현황 표시용)
export async function GET(_req: Request, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr) return apiError('VOICE_NOT_CAFE_MEMBER', 403)

  return NextResponse.json({
    participants: await getActiveParticipants(roomId),
  })
}
