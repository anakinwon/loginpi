import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import type { PiSessionUser } from '@/types/pi-session'

const PI_API_URL = 'https://api.minepi.com/v2/me'
const MAX_COOKIE_AGE_SEC = 7 * 24 * 60 * 60

function getSecret(): string {
  const secret = process.env.PI_SESSION_SECRET
  if (!secret) throw new Error('PI_SESSION_SECRET 환경변수가 설정되지 않았습니다')
  return secret
}

// 페이로드를 base64url 인코딩 후 HMAC-SHA256 서명: "<payload>.<sig>"
function signPayload(data: object, secret: string): string {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url')
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

// 서명 검증 후 페이로드 반환. 위변조 시 null
function verifyPayload<T>(value: string, secret: string): T | null {
  const dot = value.lastIndexOf('.')
  if (dot === -1) return null

  const payload = value.slice(0, dot)
  const sig = value.slice(dot + 1)
  const expected = createHmac('sha256', secret).update(payload).digest('base64url')

  // 타이밍 공격 방지: 바이트 단위 비교
  try {
    const sigBytes = Buffer.from(sig, 'base64url')
    const expectedBytes = Buffer.from(expected, 'base64url')
    if (sigBytes.length !== expectedBytes.length) return null
    if (!timingSafeEqual(sigBytes, expectedBytes)) return null
  } catch {
    return null
  }

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}

// 현재 세션 반환 (쿠키 서명 검증 포함)
export async function GET(request: NextRequest) {
  const cookieValue = request.cookies.get('pi_session')?.value
  if (!cookieValue) {
    return NextResponse.json({ user: null })
  }

  let secret: string
  try {
    secret = getSecret()
  } catch {
    return NextResponse.json({ error: 'PI_SESSION_SECRET 미설정' }, { status: 500 })
  }

  const user = verifyPayload<PiSessionUser>(cookieValue, secret)
  if (!user) {
    const res = NextResponse.json({ user: null })
    res.cookies.delete('pi_session')
    return res
  }

  // 토큰 만료 확인
  if (new Date(user.tokenValidUntil) < new Date()) {
    const res = NextResponse.json({ user: null })
    res.cookies.delete('pi_session')
    return res
  }

  return NextResponse.json({ user })
}

// Pi accessToken 검증 후 서명된 세션 쿠키 발급
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다' }, { status: 400 })
  }

  const { accessToken } = body as { accessToken?: string }
  if (!accessToken || typeof accessToken !== 'string') {
    return NextResponse.json({ error: 'accessToken이 필요합니다' }, { status: 400 })
  }

  let secret: string
  try {
    secret = getSecret()
  } catch {
    return NextResponse.json({ error: 'PI_SESSION_SECRET 미설정' }, { status: 500 })
  }

  // API 키 없이 accessToken만으로 Pi Network에서 사용자 정보 검증
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

  // Pi 토큰 만료 시각을 쿠키 maxAge로 사용 (최대 7일)
  const tokenExpiresAt = new Date(piUser.credentials.valid_until.iso8601).getTime()
  const secondsUntilExpiry = Math.floor((tokenExpiresAt - Date.now()) / 1000)
  const maxAge = Math.min(Math.max(secondsUntilExpiry, 0), MAX_COOKIE_AGE_SEC)

  // uid는 scope 없이 항상 제공, username은 'username' scope 허용 시 제공
  const sessionData: PiSessionUser = {
    uid: piUser.uid,
    displayName: piUser.username ?? `pi_${piUser.uid.slice(0, 8)}`,
    username: piUser.username ?? null,
    scopesGranted: piUser.credentials.scopes,
    tokenValidUntil: piUser.credentials.valid_until.iso8601,
  }

  const signed = signPayload(sessionData, secret)

  const response = NextResponse.json({ success: true, user: sessionData })
  response.cookies.set('pi_session', signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
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
