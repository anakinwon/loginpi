import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { verifyPayload } from '@/lib/pi-session-crypto'
import { updatePiUserWithGoogle } from '@/lib/users'
import { apiError } from '@/lib/api-errors'
import type { PiSessionUser } from '@/types/pi-session'

// POST /api/auth/link
// Pi 세션(쿠키) + Google 세션(NextAuth)이 동시에 활성화된 상태에서 호출
// → Pi row에 Google 필드 직접 UPDATE (별도 row 생성 없음)
export async function POST(request: NextRequest) {
  const secret = process.env.PI_SESSION_SECRET
  if (!secret) {
    console.error('[auth/link] PI_SESSION_SECRET 미설정')
    return apiError('SERVER_CONFIG', 500)
  }

  const piCookie = request.cookies.get('pi_session')?.value
  if (!piCookie) {
    return apiError('AUTH_PI_REQUIRED', 401)
  }
  const piUser = verifyPayload<PiSessionUser>(piCookie, secret)
  if (!piUser?.userId) {
    return apiError('AUTH_PI_SESSION_INVALID', 401)
  }

  const googleSession = await auth()
  if (!googleSession?.user?.sub) {
    return apiError('GOOGLE_AUTH_REQUIRED', 401)
  }
  if (!googleSession.user.email) {
    return apiError('GOOGLE_EMAIL_MISSING', 400)
  }

  try {
    await updatePiUserWithGoogle(piUser.userId, {
      id: googleSession.user.sub,
      email: googleSession.user.email,
      name: googleSession.user.name ?? null,
      image: googleSession.user.image ?? null,
    })
    return NextResponse.json({
      success: true,
      message: '계정이 성공적으로 연동됐습니다',
    })
  } catch (err) {
    console.error('[auth/link]', err)
    return apiError('AUTH_LINK_FAILED', 500)
  }
}
