// sitemap.pi 서버 인증 단일 진입점 — getSessionUser(쿠키 OR X-Pi-Token)·역할 게이트·로그인 upsert(env 관리자 승격).
// ⚠️ getSessionUser() null 시 redirect 금지(Pi Browser 무한 루프) → 클라이언트 게이트로 위임
import 'server-only'
import { createGetSessionUser } from '@pi/auth'
import {
  getUserById,
  getUserByPiUid,
  grantEnvAdmin,
  touchLastLogin,
  upsertPiUser,
  type PiUserInput,
} from '@pi/db'

export { isAdmin, isMaster } from '@pi/auth'

export const getSessionUser = createGetSessionUser({
  sessionSecret: process.env.PI_SESSION_SECRET,
  getUserById,
  getUserByPiUid,
  onAuthenticated: (user) => touchLastLogin(user.id),
})

// /api/auth/pi POST — sys_user upsert 후 ADMIN_PI_USERNAMES(+ADMIN_PI_UIDS 설정 시 uid 일치) 대상이면 ADMIN 승격.
// rebindByUsername:false — 다른 Pi 앱 토큰의 username 재사용 차단(uid 불일치 + 기존 username → 403 AUTH_PI_ACCOUNT_CONFLICT)
export async function upsertUser(piUser: PiUserInput) {
  return grantEnvAdmin(
    await upsertPiUser(piUser, { rebindByUsername: false }),
    process.env.ADMIN_PI_USERNAMES,
    process.env.ADMIN_PI_UIDS,
  )
}
