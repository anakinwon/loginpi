import { NextRequest, NextResponse } from 'next/server'
import { signPayload } from '@/lib/pi-session-crypto'
import { upsertPiUser } from '@/lib/users'

// Pi Browser는 form POST 네비게이션을 차단(ERR_CONNECTION_ABORTED).
// 해결: fetch()로 토큰 검증 → 단기 네비게이션 토큰 반환 → 클라이언트가 window.location.href(GET)로 이동
//
// pi-redirect(form POST)의 대체 1단계: Pi 토큰 검증 + 네비게이션 토큰 발급

const PI_API_URL = 'https://api.minepi.com/v2/me'
const NAV_TOKEN_TTL_MS = 30_000  // 30초 — GET URL 노출 최소화

interface PiMeResponse {
  uid: string
  username: string | null
  credentials: {
    scopes: string[]
    valid_until: { iso8601: string }
  }
}

function safeToPath(to: unknown): string {
  if (typeof to !== 'string') return '/'
  if (!to.startsWith('/') || to.startsWith('//') || to.startsWith('/\\')) return '/'
  return to
}

export async function POST(request: NextRequest) {
  const secret = process.env.PI_SESSION_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'server_config' }, { status: 500 })
  }

  let accessToken: string | null = null
  let to = '/'
  try {
    const body = (await request.json()) as { accessToken?: unknown; to?: unknown }
    accessToken = typeof body.accessToken === 'string' ? body.accessToken : null
    to = safeToPath(body.to)
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  if (!accessToken) {
    return NextResponse.json({ error: 'missing_token' }, { status: 400 })
  }

  // Pi Network API로 토큰 검증
  let piUser: PiMeResponse
  try {
    const piRes = await fetch(PI_API_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!piRes.ok) {
      return NextResponse.json({ error: 'pi_auth_fail' }, { status: 401 })
    }
    piUser = (await piRes.json()) as PiMeResponse
  } catch {
    return NextResponse.json({ error: 'pi_api_error' }, { status: 502 })
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
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }

  // 30초 TTL 네비게이션 토큰 — GET URL 파라미터로 전달, 서버가 pi_session 쿠키로 교환
  const navToken = signPayload(
    {
      userId,
      uid: piUser.uid,
      username: piUser.username ?? null,
      role: userRole,
      walletAddress: null,
      scopesGranted: piUser.credentials.scopes,
      tokenValidUntil: piUser.credentials.valid_until.iso8601,
      exp: Date.now() + NAV_TOKEN_TTL_MS,
    },
    secret + ':nav',
  )

  return NextResponse.json({
    redirectUrl: `/api/auth/pi-callback?t=${encodeURIComponent(navToken)}&to=${encodeURIComponent(to)}`,
  })
}
