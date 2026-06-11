import { NextRequest, NextResponse } from 'next/server'
import { signPayload } from '@/lib/pi-session-crypto'
import { upsertPiUser } from '@/lib/users'
import type { PiSessionUser } from '@/types/pi-session'

// Pi Browser WebView에서 fetch() Set-Cookie가 저장 안 되는 문제 해결용
// form POST → 302 redirect 방식으로 브라우저 네이티브 쿠키 저장 보장
//
// 문제 원인: WebView는 XHR/fetch 응답의 Set-Cookie를 OS 쿠키 저장소에 반영하지 않는 경우가 있음
// 해결책: HTML form submit (네이티브 브라우저 요청) → 서버가 Set-Cookie + 302 응답
//         브라우저가 네이티브 요청의 Set-Cookie는 항상 저장 후 리다이렉트 따라감

const PI_API_URL = 'https://api.minepi.com/v2/me'
const MAX_COOKIE_AGE_SEC = 7 * 24 * 60 * 60

interface PiMeResponse {
  uid: string
  username: string | null
  credentials: {
    scopes: string[]
    valid_until: { iso8601: string }
  }
}

function getSecret(): string {
  const secret = process.env.PI_SESSION_SECRET
  if (!secret) throw new Error('PI_SESSION_SECRET 미설정')
  return secret
}

// 오픈 리다이렉트 방지: 같은 origin의 경로만 허용
function safeRedirectPath(to: string | null): string {
  if (!to || !to.startsWith('/') || to.startsWith('//')) return '/'
  return to
}

export async function POST(request: NextRequest) {
  let secret: string
  try {
    secret = getSecret()
  } catch {
    return NextResponse.redirect(new URL('/?error=server_config', request.url))
  }

  const formData = await request.formData()
  const accessToken = formData.get('accessToken') as string | null
  const to = safeRedirectPath(formData.get('to') as string | null)

  if (!accessToken) {
    return NextResponse.redirect(new URL('/?error=missing_token', request.url))
  }

  // Pi Network API 토큰 검증
  let piUser: PiMeResponse
  try {
    const piRes = await fetch(PI_API_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!piRes.ok) {
      return NextResponse.redirect(new URL('/?error=pi_auth_fail', request.url))
    }
    piUser = (await piRes.json()) as PiMeResponse
  } catch {
    return NextResponse.redirect(new URL('/?error=pi_api_error', request.url))
  }

  // DB upsert → userId·role 확보
  let userId = ''
  let userRole = 'USER'
  try {
    const dbUser = await upsertPiUser({
      uid: piUser.uid,
      username: piUser.username ?? null,
      walletAddress: null,
    })
    userId = dbUser.id
    userRole = dbUser.role
  } catch {
    return NextResponse.redirect(new URL('/?error=db_error', request.url))
  }

  const tokenExpiresAt = new Date(
    piUser.credentials.valid_until.iso8601,
  ).getTime()
  const secondsUntilExpiry = Math.floor((tokenExpiresAt - Date.now()) / 1000)
  const maxAge = Math.min(Math.max(secondsUntilExpiry, 0), MAX_COOKIE_AGE_SEC)

  const sessionData: PiSessionUser = {
    userId,
    uid: piUser.uid,
    displayName: piUser.username ?? `pi_${piUser.uid.slice(0, 8)}`,
    username: piUser.username ?? null,
    walletAddress: null,
    scopesGranted: piUser.credentials.scopes,
    tokenValidUntil: piUser.credentials.valid_until.iso8601,
    role: userRole,
  }

  const signed = signPayload(sessionData, secret)
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
