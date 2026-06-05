import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { verifyPayload } from '@/lib/pi-session-crypto'
import { updatePiUserWithGoogle } from '@/lib/users'
import type { PiSessionUser } from '@/types/pi-session'

// POST /api/auth/link
// Pi 세션(쿠키) + Google 세션(NextAuth)이 동시에 활성화된 상태에서 호출
// → Pi row에 Google 필드 직접 UPDATE (별도 row 생성 없음)
export async function POST(request: NextRequest) {
  const secret = process.env.PI_SESSION_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'PI_SESSION_SECRET 미설정' }, { status: 500 })
  }

  const piCookie = request.cookies.get('pi_session')?.value
  if (!piCookie) {
    return NextResponse.json({ error: 'Pi 로그인이 필요합니다' }, { status: 401 })
  }
  const piUser = verifyPayload<PiSessionUser>(piCookie, secret)
  if (!piUser?.userId) {
    return NextResponse.json({ error: '유효하지 않은 Pi 세션입니다' }, { status: 401 })
  }

  const googleSession = await auth()
  if (!googleSession?.user?.sub) {
    return NextResponse.json({ error: 'Google 로그인이 필요합니다' }, { status: 401 })
  }
  if (!googleSession.user.email) {
    return NextResponse.json({ error: 'Google 이메일 정보가 없습니다' }, { status: 400 })
  }

  try {
    await updatePiUserWithGoogle(piUser.userId, {
      id: googleSession.user.sub,
      email: googleSession.user.email,
      name: googleSession.user.name ?? null,
      image: googleSession.user.image ?? null,
    })
    return NextResponse.json({ success: true, message: '계정이 성공적으로 연동됐습니다' })
  } catch (err) {
    const message = err instanceof Error ? err.message : '계정 연동 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
