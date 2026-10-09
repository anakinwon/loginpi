// @pi/auth — 서버 세션: HMAC 토큰 서명/검증, 쿠키 OR X-Pi-Token 헤더 이중 경로 검증, 역할 게이트.
// 출처: cafe.pi src/lib/pi-session-crypto.ts·auth-check.ts(Pi 경로만 — NextAuth·Google·pit-ticket 제외). DB 조회는 주입.
// ⚠️ getSessionUser()가 null이어도 호출부는 redirect 금지(Pi Browser 무한 루프) → 클라이언트 게이트로 위임.
import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'
import { cookies, headers } from 'next/headers'
import type { PiSessionUser } from './types'

export const PI_SESSION_COOKIE = 'pi_session'
export const PI_TOKEN_HEADER = 'x-pi-token'
// 세션 토큰 최대 수명 — exp = min(Pi valid_until, 발급+7일)
export const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60

export function signPayload(data: object, secret: string): string {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url')
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyPayload<T>(value: string, secret: string): T | null {
  const dot = value.lastIndexOf('.')
  if (dot === -1) return null
  const payload = value.slice(0, dot)
  const sig = value.slice(dot + 1)
  const expected = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url')
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

// NextRequest 또는 next/headers의 cookies()+headers() 조합 — 둘 다 이 형태를 만족한다
export interface TokenSource {
  cookies: { get(name: string): { value: string } | undefined }
  headers: { get(name: string): string | null }
}

// 서명 + 만료 검증(쿠키·헤더 공용 단일 지점). exp(epoch 초) 누락·비정상·경과 토큰은 거부 —
// 헤더 토큰은 쿠키 maxAge 같은 자동 만료가 없고, exp 없는 구버전 토큰은 무기한 재사용될 수 있다.
export function verifySessionToken(
  token: string,
  secret: string,
): PiSessionUser | null {
  const session = verifyPayload<PiSessionUser>(token, secret)
  if (!session) return null
  const now = Date.now()
  if (
    typeof session.exp !== 'number' ||
    !Number.isFinite(session.exp) ||
    session.exp * 1000 <= now
  )
    return null
  if (
    session.tokenValidUntil &&
    !(new Date(session.tokenValidUntil).getTime() > now)
  )
    return null
  return session
}

// 쿠키(일반 브라우저) 우선 → 없으면 X-Pi-Token 헤더(Pi Browser — Set-Cookie 미저장) 폴백.
export function verifyPiSession(
  source: TokenSource,
  secret: string,
): PiSessionUser | null {
  const token =
    source.cookies.get(PI_SESSION_COOKIE)?.value ||
    source.headers.get(PI_TOKEN_HEADER)
  if (!token) return null
  return verifySessionToken(token, secret)
}

export interface SessionUserDeps<U> {
  sessionSecret: string | undefined
  getUserById: (id: string) => Promise<U | null>
  // 구버전 토큰(userId='')·DB 오류 폴백
  getUserByPiUid?: (uid: string) => Promise<U | null>
  // 인증 성공 시 부수효과(예: touchLastLogin). 응답을 막지 않아야 한다
  onAuthenticated?: (user: U) => void
}

// getSessionUser 생성 — req 미지정 시 서버 컴포넌트/라우트의 next/headers에서 읽는다
export function createGetSessionUser<U extends { id: string }>(
  deps: SessionUserDeps<U>,
) {
  return async function getSessionUser(req?: TokenSource): Promise<U | null> {
    if (!deps.sessionSecret) return null
    const source: TokenSource = req ?? {
      cookies: await cookies(),
      headers: await headers(),
    }
    const session = verifyPiSession(source, deps.sessionSecret)
    if (!session) return null

    let user: U | null = null
    if (session.userId) user = await deps.getUserById(session.userId)
    else if (session.uid && deps.getUserByPiUid)
      user = await deps.getUserByPiUid(session.uid)
    if (user) deps.onAuthenticated?.(user)
    return user
  }
}

export function isAdmin(user: { role: string } | null): boolean {
  return user?.role === 'ADMIN' || user?.role === 'MASTER'
}

// 초고위험 게이트 전용(배포·요금·DB 스위치). ADMIN이 최상위 — role==='MASTER' 단독 비교 금지(전원 차단 사문화).
// 타입 술어로 선언해야 호출부 TS 내로잉이 유지된다
export function isMaster<U extends { role: string }>(user: U | null): user is U {
  return user?.role === 'ADMIN' || user?.role === 'MASTER'
}
