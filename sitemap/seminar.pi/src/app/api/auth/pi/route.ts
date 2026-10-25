// Pi 로그인 API — POST(accessToken 검증→sys_user upsert·env 관리자 승격→쿠키+JSON token)·GET(세션)·DELETE(로그아웃). 구현은 @pi/auth 팩토리
// requireDbUser: upsert 실패 시 유령 세션(userId='') 대신 503 — 연동 코드 발급 등 모든 보호 API 가 sys_user 행을 전제로 하기 때문(2026-10-11 점검)
import { createPiAuthRoute } from '@pi/auth'
import { getSessionUser, upsertUser } from '@/lib/auth'

export const { GET, POST, DELETE } = createPiAuthRoute({
  sessionSecret: process.env.PI_SESSION_SECRET,
  upsertUser,
  getSessionUser,
  requireDbUser: true,
})
