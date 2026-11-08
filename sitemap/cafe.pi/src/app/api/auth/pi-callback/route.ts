import { NextRequest, NextResponse } from 'next/server'
import { verifyPayload, signPayload } from '@/lib/pi-session-crypto'
import type { PiSessionUser } from '@/types/pi-session'

// Pi Browser 인증 2단계: 네비게이션 토큰 → pi_session 쿠키 교환
//
// 클라이언트가 window.location.href(GET)로 이 URL에 접근.
// Pi Browser WebView는 302/307 리다이렉트 응답의 Set-Cookie를 follow 요청에 전달하지 않으므로,
// redirect 대신 HTML 응답 + window.location.replace()를 사용해 쿠키를 안정적으로 저장.

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

  // Pi Browser WebView는 302/307 리다이렉트 응답의 Set-Cookie를
  // 리다이렉트 follow 요청에 전달하지 않는 WebView 버그가 있음.
  // 해결: HTML 응답으로 쿠키를 먼저 저장한 후 window.location.replace()로 이동.
  // 브라우저가 HTML 응답 전체를 처리(Set-Cookie 포함)한 뒤 JS가 실행되므로
  // replace() 요청에 쿠키가 확실히 포함됨.
  // JSON.stringify()로 to를 직렬화 → 특수문자 XSS 방지 (safeRedirectPath regex 이중 보호)
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><script>window.location.replace(${JSON.stringify(to)})</script></head><body></body></html>`
  const response = new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
  response.cookies.set('pi_session', signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  })
  return response
}
