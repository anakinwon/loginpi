import { NextRequest, NextResponse } from 'next/server'
import { signPayload, verifyPayload } from '@/lib/pi-session-crypto'
import { upsertPiUser } from '@/lib/users'
import type { PiSessionUser } from '@/types/pi-session'

const PI_API_URL = 'https://api.minepi.com/v2/me'
const MAX_COOKIE_AGE_SEC = 7 * 24 * 60 * 60

function getSecret(): string {
  const secret = process.env.PI_SESSION_SECRET
  if (!secret) throw new Error('PI_SESSION_SECRET 환경변수가 설정되지 않았습니다')
  return secret
}

// 현재 세션 반환 (쿠키 서명 검증 + 만료 확인)
export async function GET(request: NextRequest) {
  const cookieValue = request.cookies.get('pi_session')?.value
  if (!cookieValue) return NextResponse.json({ user: null })

  let secret: string
  try { secret = getSecret() } catch {
    return NextResponse.json({ error: 'PI_SESSION_SECRET 미설정' }, { status: 500 })
  }

  const user = verifyPayload<PiSessionUser>(cookieValue, secret)
  if (!user) {
    const res = NextResponse.json({ user: null })
    res.cookies.delete('pi_session')
    return res
  }
  if (new Date(user.tokenValidUntil) < new Date()) {
    const res = NextResponse.json({ user: null })
    res.cookies.delete('pi_session')
    return res
  }
  return NextResponse.json({ user })
}

// Pi accessToken 검증 → Supabase upsert → HMAC 서명 세션 쿠키 발급
export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다' }, { status: 400 })
  }

  const { accessToken, walletAddress } = body as {
    accessToken?: string
    walletAddress?: string | null
  }
  if (!accessToken || typeof accessToken !== 'string') {
    return NextResponse.json({ error: 'accessToken이 필요합니다' }, { status: 400 })
  }

  let secret: string
  try { secret = getSecret() } catch {
    return NextResponse.json({ error: 'PI_SESSION_SECRET 미설정' }, { status: 500 })
  }

  // Pi Network API로 토큰 검증
  let piUser: PiUserDTO
  try {
    const piRes = await fetch(PI_API_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!piRes.ok) {
      return NextResponse.json({ error: 'Pi 토큰 검증 실패' }, { status: 401 })
    }
    piUser = (await piRes.json()) as PiUserDTO
  } catch {
    return NextResponse.json({ error: 'Pi Network API 연결 실패' }, { status: 502 })
  }

  // Supabase users 테이블에 upsert → userId 획득
  let userId = ''
  try {
    const dbUser = await upsertPiUser({
      uid: piUser.uid,
      username: piUser.username ?? null,
      walletAddress: typeof walletAddress === 'string' ? walletAddress : null,
    })
    userId = dbUser.id
  } catch {
    // DB 오류 시 userId 없이 계속 진행 (graceful degradation)
  }

  // Pi 토큰 만료 → 쿠키 maxAge
  const tokenExpiresAt = new Date(piUser.credentials.valid_until.iso8601).getTime()
  const secondsUntilExpiry = Math.floor((tokenExpiresAt - Date.now()) / 1000)
  const maxAge = Math.min(Math.max(secondsUntilExpiry, 0), MAX_COOKIE_AGE_SEC)

  const sessionData: PiSessionUser = {
    userId,
    uid: piUser.uid,
    displayName: piUser.username ?? `pi_${piUser.uid.slice(0, 8)}`,
    username: piUser.username ?? null,
    walletAddress: typeof walletAddress === 'string' ? walletAddress : null,
    scopesGranted: piUser.credentials.scopes,
    tokenValidUntil: piUser.credentials.valid_until.iso8601,
  }

  const signed = signPayload(sessionData, secret)
  const response = NextResponse.json({ success: true, user: sessionData })
  response.cookies.set('pi_session', signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Pi Browser WebView에서 strict 쿠키가 저장 안 되는 문제 방지
    sameSite: 'lax',
    maxAge,
    path: '/',
  })
  return response
}

export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.delete('pi_session')
  return response
}
