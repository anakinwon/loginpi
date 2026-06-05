import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { verifyPayload } from '@/lib/pi-session-crypto'
import { linkGoogleToPiUser } from '@/lib/users'
import type { PiSessionUser } from '@/types/pi-session'
import type { LinkTokenPayload } from '../link-start/route'

function getSecret() {
  const s = process.env.PI_SESSION_SECRET
  if (!s) throw new Error('PI_SESSION_SECRET 미설정')
  return s
}

// POST /api/auth/link-complete
// Body: { token: string }
// — provider=pi 토큰: Google 세션 필요 → linkGoogleToPiUser(pi_userId, google_userId)
// — provider=google 토큰: Pi 세션 필요 → linkGoogleToPiUser(pi_userId, google_userId)
export async function POST(request: NextRequest) {
  let secret: string
  try { secret = getSecret() } catch {
    return NextResponse.json({ error: 'PI_SESSION_SECRET 미설정' }, { status: 500 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }
  const { token } = body as { token?: string }
  if (!token) {
    return NextResponse.json({ error: 'token이 필요합니다' }, { status: 400 })
  }

  // 링크 토큰 검증
  const payload = verifyPayload<LinkTokenPayload>(token, secret)
  if (!payload) {
    return NextResponse.json({ error: '유효하지 않은 연동 링크입니다' }, { status: 400 })
  }
  if (Date.now() / 1000 > payload.exp) {
    return NextResponse.json({ error: '연동 링크가 만료됐습니다 (10분 초과)' }, { status: 400 })
  }

  try {
    if (payload.provider === 'pi') {
      // Pi 사용자가 생성한 토큰 → 지금은 Google 브라우저에서 실행 중
      const googleSession = await auth()
      if (!googleSession?.user?.id) {
        return NextResponse.json({ error: 'Google 로그인이 필요합니다' }, { status: 401 })
      }
      await linkGoogleToPiUser(payload.userId, googleSession.user.id)
    } else {
      // Google 사용자가 생성한 토큰 → 지금은 Pi Browser에서 실행 중
      const piCookie = request.cookies.get('pi_session')?.value
      const piUser = piCookie ? verifyPayload<PiSessionUser>(piCookie, secret) : null
      if (!piUser?.userId) {
        return NextResponse.json({ error: 'Pi 로그인이 필요합니다' }, { status: 401 })
      }
      await linkGoogleToPiUser(piUser.userId, payload.userId)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : '계정 연동 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
