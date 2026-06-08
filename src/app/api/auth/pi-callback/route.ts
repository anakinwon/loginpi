import { NextRequest, NextResponse } from 'next/server'
import { verifyPayload, signPayload } from '@/lib/pi-session-crypto'
import type { PiSessionUser } from '@/types/pi-session'

// Pi Browser 대체 2단계: 네비게이션 토큰 → pi_session 쿠키 교환
//
// 클라이언트가 window.location.href(GET)로 이 URL에 접근.
// GET 네비게이션 응답의 Set-Cookie는 WebView에 안정적으로 저장됨.
// 200 HTML 응답 + JS redirect로 쿠키를 200 응답에 첨부 — 302보다 안전한 WebView 쿠키 저장.

const MAX_COOKIE_AGE_SEC = 7 * 24 * 60 * 60

interface NavTokenPayload extends PiSessionUser {
  exp: number
}

function safeRedirectPath(to: string | null): string {
  if (!to || !to.startsWith('/') || to.startsWith('//') || to.startsWith('/\\')) return '/'
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

  // 302 대신 200 HTML 응답: Set-Cookie가 200 응답에 첨부되어 WebView 쿠키 저장이 더 안정적
  // JS redirect로 목적지 이동
  const escapedTo = to.replace(/'/g, "\\'")
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><script>window.location.replace('${escapedTo}')</script></head><body></body></html>`

  const response = new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
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
