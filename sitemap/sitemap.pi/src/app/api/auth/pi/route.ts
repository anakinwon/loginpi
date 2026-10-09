// Pi 로그인 API — POST(accessToken 검증→sys_user upsert·env 관리자 승격→쿠키+JSON token)·GET(세션)·DELETE(로그아웃). 구현은 @pi/auth 팩토리
import { createPiAuthRoute } from '@pi/auth'
import { getSessionUser, upsertUser } from '@/lib/auth'

export const { GET, POST, DELETE } = createPiAuthRoute({
  sessionSecret: process.env.PI_SESSION_SECRET,
  upsertUser,
  getSessionUser,
})
