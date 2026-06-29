import { NextRequest, NextResponse } from 'next/server'
import { signPayload, verifyPayload } from '@/lib/pi-session-crypto'
import { upsertPiUser } from '@/lib/users'
import { getSessionUser } from '@/lib/auth-check'
import { recordActivity } from '@/lib/activity-log'
import { withAuthGuard } from '@/lib/api-guard'
import type { PiSessionUser } from '@/types/pi-session'
import type { UserRow } from '@/lib/users'

const PI_API_URL = 'https://api.minepi.com/v2/me'
const MAX_COOKIE_AGE_SEC = 7 * 24 * 60 * 60

// 통합 세션(Google/Pi 헤더)으로 복원된 DB 사용자 → 클라이언트용 PiSessionUser 매핑.
// Pi 전용 정보(walletAddress·scopes)는 Pi 쿠키 경로에서만 채워지며, 여기선 게이트 판정에 충분한 최소 필드만 채운다.
function toPiSessionUser(u: UserRow): PiSessionUser {
  return {
    userId: u.id,
    uid: u.pi_uid ?? '',
    displayName: u.display_name,
    username: u.pi_username,
    walletAddress: null,
    scopesGranted: [],
    tokenValidUntil: new Date(
      Date.now() + MAX_COOKIE_AGE_SEC * 1000,
    ).toISOString(),
    role: u.role,
    nick_nm: u.nick_nm,
  }
}

function getSecret(): string {
  const secret = process.env.PI_SESSION_SECRET
  if (!secret)
    throw new Error('PI_SESSION_SECRET 환경변수가 설정되지 않았습니다')
  return secret
}

// 현재 세션 반환 (쿠키 서명 검증 + 만료 확인)
export const GET = withAuthGuard(async function (request: NextRequest) {
  const cookieValue = request.cookies.get('pi_session')?.value
  if (!cookieValue) {
    // Pi 세션 쿠키 없음 → 통합 세션(Google NextAuth, 또는 X-Pi-Token 헤더) 폴백.
    // API route라 auth()가 정상 동작하므로, SSR(서버 컴포넌트)이 Google 세션을 못 읽는
    // 환경(모바일 일반 브라우저 등)에서도 클라이언트 usePiAuth가 사용자를 인식하게 한다.
    const sessionUser = await getSessionUser()
    if (sessionUser) {
      recordActivity(sessionUser.id, 'LOGIN')
      return NextResponse.json({ user: toPiSessionUser(sessionUser) })
    }
    return NextResponse.json({ user: null })
  }

  let secret: string
  try {
    secret = getSecret()
  } catch {
    return NextResponse.json(
      { error: 'PI_SESSION_SECRET 미설정' },
      { status: 500 },
    )
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
  // 세션 복원 성공 → 활동 기록 (fire-and-forget)
  if (user.userId) recordActivity(user.userId, 'LOGIN')
  return NextResponse.json({ user })
})

// Pi accessToken 검증 → Supabase upsert → HMAC 서명 세션 쿠키 발급
export const POST = withAuthGuard(async function (request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: '잘못된 요청 본문입니다' },
      { status: 400 },
    )
  }

  const { accessToken, walletAddress } = body as {
    accessToken?: string
    walletAddress?: string | null
  }
  if (!accessToken || typeof accessToken !== 'string') {
    return NextResponse.json(
      { error: 'accessToken이 필요합니다' },
      { status: 400 },
    )
  }

  let secret: string
  try {
    secret = getSecret()
  } catch {
    return NextResponse.json(
      { error: 'PI_SESSION_SECRET 미설정' },
      { status: 500 },
    )
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
    return NextResponse.json(
      { error: 'Pi Network API 연결 실패' },
      { status: 502 },
    )
  }

  // Supabase users 테이블에 upsert → userId·role·nick_nm 획득
  let userId = ''
  let userRole = 'USER'
  let nickNm: string | null = null
  try {
    const dbUser = await upsertPiUser({
      uid: piUser.uid,
      username: piUser.username ?? null,
      walletAddress: typeof walletAddress === 'string' ? walletAddress : null,
    })
    userId = dbUser.id
    userRole = dbUser.role
    nickNm = dbUser.nick_nm ?? null
  } catch {
    // DB 오류 시 userId 없이 계속 진행 (graceful degradation)
  }

  // 로그인 성공 → 활동 기록 (fire-and-forget)
  if (userId) recordActivity(userId, 'LOGIN')

  // Pi 토큰 만료 → 쿠키 maxAge
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
    walletAddress: typeof walletAddress === 'string' ? walletAddress : null,
    scopesGranted: piUser.credentials.scopes,
    tokenValidUntil: piUser.credentials.valid_until.iso8601,
    role: userRole,
    nick_nm: nickNm,
  }

  const signed = signPayload(sessionData, secret)
  // 쿠키(일반 브라우저) + token(Pi Browser localStorage→X-Pi-Token 헤더) 이중 제공.
  // Pi Browser WebView는 Set-Cookie를 저장하지 않으므로 클라이언트가 token을 보관해야 한다.
  const response = NextResponse.json({
    success: true,
    user: sessionData,
    token: signed,
  })
  response.cookies.set('pi_session', signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Pi Browser WebView에서 strict 쿠키가 저장 안 되는 문제 방지
    sameSite: 'lax',
    maxAge,
    path: '/',
  })
  return response
})

export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.delete('pi_session')
  return response
}
