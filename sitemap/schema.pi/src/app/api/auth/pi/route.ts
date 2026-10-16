// Pi 로그인 API — POST(accessToken → /v2/me 검증 → sys_user upsert → pi_session 쿠키 + JSON token)·GET(세션)·DELETE(로그아웃). 구현은 @pi/auth 팩토리
// requireDbUser: upsert 실패 시 유령 세션(userId='') 대신 503 — 모든 보호 API 가 sys_user.usr_id 를 전제로 하기 때문
import { createPiAuthRoute } from '@pi/auth'
import { getSessionUser, upsertUser } from '@/lib/auth'

export const { GET, POST, DELETE } = createPiAuthRoute({
  sessionSecret: process.env.PI_SESSION_SECRET,
  upsertUser,
  getSessionUser,
  requireDbUser: true,
})
