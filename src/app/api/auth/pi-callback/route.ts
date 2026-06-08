import { NextRequest, NextResponse } from 'next/server'
import { verifyPayload, signPayload } from '@/lib/pi-session-crypto'
import type { PiSessionUser } from '@/types/pi-session'

// Pi Browser 대체 2단계: 네비게이션 토큰 → pi_session 쿠키 교환
//
// 클라이언트가 window.location.href(GET)로 이 URL에 접근.
// GET 네비게이션 302 응답의 Set-Cookie는 WebView에 안정적으로 저장됨.
// (form POST와 달리 GET 탑레벨 네비게이션은 Pi Browser WebView가 차단하지 않음)

const MAX_COOKIE_AGE_SEC = 7 * 24 * 60 * 60

interface NavTokenPayload extends PiSessionUser {
  exp: number
}

// 알파벳·숫자·URL 안전 특수문자만 허용 — HTML/JS 인젝션 가능한 <>"'` 등 원천 차단
function safeRedirectPath(to: string | null): string {
  if (!to || !/^\/[A-Za-z0-9\-_./?=&%#]*$/.test(to)) return '/'
  return to
}

export async function GET(request: NextRequest) {
  const secret = process.env.PI_SESSION_SECRET
  if (!secret) {
    return NextResponse.redirect(new URL('/?error=server_config', request.url))
  }

  const { searchParams } = new URL(request.url)
  const t = searchParams.get('t')
  const to = safeRedirectPath(searchParams.get('to'))

  if (!t) {
    return NextResponse.redirect(new URL('/?error=missing_token', request.url))
  }

  const payload = verifyPayload<NavTokenPayload>(t, secret + ':nav')
  if (!payload) {
    return NextResponse.redirect(new URL('/?error=invalid_token', request.url))
  }

  if (Date.now() > payload.exp) {
    return NextResponse.redirect(new URL('/?error=token_expired', request.url))
  }

  const sessionData: PiSessionUser = {
    userId: payload.userId,
    uid: payload.uid,
    displayName: payload.username ?? `pi_${payload.uid.slice(0, 8)}`,
    username: payload.username,
    walletAddress: null,
    scopesGranted: payload.scopesGranted,
    tokenValidUntil: payload.tokenValidUntil,
    role: payload.role,
  }

  const tokenExpiresAt = new Date(payload.tokenValidUntil).getTime()
  const secondsUntilExpiry = Math.floor((tokenExpiresAt - Date.now()) / 1000)
  const maxAge = Math.min(Math.max(secondsUntilExpiry, 0), MAX_COOKIE_AGE_SEC)

  const signed = signPayload(sessionData, secret)

  // HTML 빌딩 없이 302 redirect — XSS 위험 없는 가장 단순한 방식
  const response = NextResponse.redirect(new URL(to, request.url))
  response.cookies.set('pi_session', signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  })
  return response
}
