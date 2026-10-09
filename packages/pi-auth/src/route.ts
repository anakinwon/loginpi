// @pi/auth — /api/auth/pi 라우트 팩토리. 출처: cafe.pi src/app/api/auth/pi/route.ts(동작 동일, DB·계측 주입).
// POST: Pi accessToken → /v2/me 검증 → upsertUser → HMAC 세션을 pi_session 쿠키 + JSON token 둘 다 반환
//       (Pi Browser는 Set-Cookie를 저장하지 않아 클라이언트가 token을 localStorage → X-Pi-Token 헤더로 보낸다)
// GET: 현재 세션(쿠키 서명·만료) / 쿠키 없으면 getSessionUser 폴백 · DELETE: 쿠키 삭제
// 사용: export const { GET, POST, DELETE } = createPiAuthRoute({ sessionSecret, upsertUser, getSessionUser })
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { apiError, withAuthGuard, type GuardOptions } from '@pi/guard'
import {
  signPayload,
  verifySessionToken,
  PI_SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
} from './session'
import type { PiSessionUser } from './types'
import './pi-sdk'

const PI_API_URL = 'https://api.minepi.com/v2/me'

// upsertUser·getSessionUser가 돌려줄 최소 사용자 형태(sys_user 행)
export interface PiAuthUserRecord {
  id: string
  role: string
  pi_uid: string | null
  pi_username: string | null
  display_name: string
  nick_nm?: string | null
}

export interface PiAuthRouteOptions<U extends PiAuthUserRecord> {
  sessionSecret: string | undefined
  upsertUser: (piUser: {
    uid: string
    username: string | null
    walletAddress: string | null
  }) => Promise<U>
  // GET 쿠키 부재 시 폴백(X-Pi-Token 헤더 등 통합 세션). 미지정 시 { user: null }
  getSessionUser?: (req: NextRequest) => Promise<U | null>
  // 로그인·세션 복원 기록(fire-and-forget)
  onLogin?: (userId: string) => void
  guard?: GuardOptions
}

// 통합 세션으로 복원된 DB 사용자 → 클라이언트용 PiSessionUser(게이트 판정 최소 필드)
function toPiSessionUser(u: PiAuthUserRecord): PiSessionUser {
  return {
    userId: u.id,
    uid: u.pi_uid ?? '',
    displayName: u.display_name,
    username: u.pi_username,
    walletAddress: null,
    scopesGranted: [],
    tokenValidUntil: new Date(
      Date.now() + SESSION_MAX_AGE_SEC * 1000,
    ).toISOString(),
    role: u.role,
    nick_nm: u.nick_nm ?? null,
  }
}

function clearedNull(): NextResponse {
  const res = NextResponse.json({ user: null })
  res.cookies.delete(PI_SESSION_COOKIE)
  return res
}

export function createPiAuthRoute<U extends PiAuthUserRecord>(
  opts: PiAuthRouteOptions<U>,
) {
  const GET = withAuthGuard(async (request: NextRequest) => {
    const cookieValue = request.cookies.get(PI_SESSION_COOKIE)?.value
    if (!cookieValue) {
      const sessionUser = await opts.getSessionUser?.(request)
      if (sessionUser) {
        opts.onLogin?.(sessionUser.id)
        return NextResponse.json({ user: toPiSessionUser(sessionUser) })
      }
      return NextResponse.json({ user: null })
    }

    if (!opts.sessionSecret) {
      console.error('[auth/pi] PI_SESSION_SECRET 미설정')
      return apiError('SERVER_CONFIG', 500)
    }
    const user = verifySessionToken(cookieValue, opts.sessionSecret)
    if (!user) return clearedNull()
    if (user.userId) opts.onLogin?.(user.userId)
    return NextResponse.json({ user })
  }, opts.guard)

  const POST = withAuthGuard(async (request: NextRequest) => {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiError('BAD_REQUEST_BODY', 400)
    }

    const { accessToken, walletAddress } = body as {
      accessToken?: string
      walletAddress?: string | null
    }
    if (!accessToken || typeof accessToken !== 'string') {
      return apiError('AUTH_ACCESS_TOKEN_REQUIRED', 400)
    }
    if (!opts.sessionSecret) {
      console.error('[auth/pi] PI_SESSION_SECRET 미설정')
      return apiError('SERVER_CONFIG', 500)
    }

    // Pi Network API로 토큰 검증 — 클라이언트가 보낸 uid·username은 신뢰하지 않는다
    let piUser: PiUserDTO
    try {
      const piRes = await fetch(PI_API_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!piRes.ok) return apiError('AUTH_PI_TOKEN_INVALID', 401)
      piUser = (await piRes.json()) as PiUserDTO
    } catch {
      return apiError('PI_API_CONNECT_FAILED', 502)
    }

    const wallet = typeof walletAddress === 'string' ? walletAddress : null

    // DB upsert → userId·role·nick_nm. DB 오류 시 userId 없이 진행(graceful degradation — cafe 동작 동일)
    let userId = ''
    let userRole = 'USER'
    let nickNm: string | null = null
    try {
      const dbUser = await opts.upsertUser({
        uid: piUser.uid,
        username: piUser.username ?? null,
        walletAddress: wallet,
      })
      userId = dbUser.id
      userRole = dbUser.role
      nickNm = dbUser.nick_nm ?? null
    } catch (e) {
      // 계정 정책 거부(@pi/db PiLoginRejectedError — 타 앱 토큰 username 재사용·비활성 계정)는 세션 미발급 403
      const code = (e as { code?: unknown } | null)?.code
      if (
        code === 'AUTH_PI_ACCOUNT_CONFLICT' ||
        code === 'AUTH_PI_ACCOUNT_INACTIVE'
      )
        return apiError(code, 403)
      console.error('[auth/pi] upsertUser 실패:', e)
    }

    if (userId) opts.onLogin?.(userId)

    // 세션 만료 exp = min(Pi valid_until, 발급+7일) — 서명 payload에 넣어 쿠키·헤더 모두 서버가 강제. 쿠키 maxAge도 동일
    const nowSec = Math.floor(Date.now() / 1000)
    const piExpSec = Math.floor(
      new Date(piUser.credentials.valid_until.iso8601).getTime() / 1000,
    )
    const exp = Math.min(
      Number.isFinite(piExpSec) ? piExpSec : Infinity,
      nowSec + SESSION_MAX_AGE_SEC,
    )
    const maxAge = Math.max(exp - nowSec, 0)

    const sessionData: PiSessionUser = {
      userId,
      uid: piUser.uid,
      displayName: piUser.username ?? `pi_${piUser.uid.slice(0, 8)}`,
      username: piUser.username ?? null,
      walletAddress: wallet,
      scopesGranted: piUser.credentials.scopes,
      tokenValidUntil: piUser.credentials.valid_until.iso8601,
      role: userRole,
      nick_nm: nickNm,
      exp,
    }

    const signed = signPayload(sessionData, opts.sessionSecret)
    // 쿠키(일반 브라우저) + token(Pi Browser localStorage→X-Pi-Token 헤더) 이중 제공
    const response = NextResponse.json({
      success: true,
      user: sessionData,
      token: signed,
    })
    response.cookies.set(PI_SESSION_COOKIE, signed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // strict는 Pi Browser WebView에서 저장 안 됨
      maxAge,
      path: '/',
    })
    return response
  }, opts.guard)

  async function DELETE() {
    const response = NextResponse.json({ success: true })
    response.cookies.delete(PI_SESSION_COOKIE)
    return response
  }

  return { GET, POST, DELETE }
}
