import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getRoomMember } from '@/lib/chat'
import { getActiveParticipants } from '@/lib/voice'

type Params = { params: Promise<{ roomId: string }> }

// GET /api/voice/rooms/[roomId]/participants — 음성채널 현재 참여자 (입장 전 현황 표시용)
export async function GET(_req: Request, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr)
    return NextResponse.json({ error: '카페 멤버가 아닙니다' }, { status: 403 })

  return NextResponse.json({
    participants: await getActiveParticipants(roomId),
  })
}
