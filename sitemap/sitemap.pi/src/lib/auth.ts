// sitemap.pi 서버 인증 단일 진입점 — getSessionUser(Pi 쿠키 OR X-Pi-Token → 없으면 Google(NextAuth) 연동 세션)·역할 게이트·로그인 upsert.
// 로그인 통합(마스터 지시 2026-10-11, cafe.pi 방식): Pi Browser = Pi SDK 세션 / 일반 브라우저 = Google 세션 + sys_usr_auth_lnk 매핑.
// ⚠️ getSessionUser() null 시 redirect 금지(Pi Browser 무한 루프) → 클라이언트 게이트로 위임
import 'server-only'
import { createGetSessionUser, type TokenSource } from '@pi/auth'
import {
  getUserById,
  getUserByPiUid,
  grantEnvAdmin,
  touchLastLogin,
  upsertPiUser,
  type PiUserInput,
  type UserRow,
} from '@pi/db'
import { auth, googleEnabled } from '@/auth'

export { isAdmin, isMaster } from '@pi/auth'

// Pi 세션만(쿠키 OR 헤더) — 연동 코드 발급처럼 "Pi Browser 로그인" 자체가 조건인 곳에서 사용
export const getPiSessionUser = createGetSessionUser({
  sessionSecret: process.env.PI_SESSION_SECRET,
  getUserById,
  getUserByPiUid,
  onAuthenticated: (user) => touchLastLogin(user.id),
})

// 통합 세션 — Pi 우선, 없으면 Google 세션의 연동 사용자(session.user.id = sys_user.usr_id, 미연동이면 '')
export async function getSessionUser(
  req?: TokenSource,
): Promise<UserRow | null> {
  const pi = await getPiSessionUser(req)
  if (pi) return pi
  if (!googleEnabled()) return null
  try {
    const session = await auth()
    const id = session?.user?.id
    if (!id) return null
    const user = await getUserById(id)
    if (user) touchLastLogin(user.id)
    return user
  } catch {
    return null
  }
}

// /api/auth/pi POST — sys_user upsert 후 ADMIN_PI_USERNAMES(+ADMIN_PI_UIDS 설정 시 uid 일치) 대상이면 ADMIN 승격.
// rebindByUsername:false — 다른 Pi 앱 토큰의 username 재사용 차단(uid 불일치 + 기존 username → 403 AUTH_PI_ACCOUNT_CONFLICT)
export async function upsertUser(piUser: PiUserInput) {
  return grantEnvAdmin(
    await upsertPiUser(piUser, { rebindByUsername: false }),
    process.env.ADMIN_PI_USERNAMES,
    process.env.ADMIN_PI_UIDS,
  )
}
