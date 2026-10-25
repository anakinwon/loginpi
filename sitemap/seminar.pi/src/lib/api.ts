// seminar.pi API 공용 — 에러 카탈로그(code → messages apiErrors.<CODE>), DB 가용성 래퍼(미설정·미연결 = 503), 인증·관리자 게이트.
// sitemap.pi src/lib/api.ts 에서 로그인에 필요한 부분만 가져옴. 사용: export const GET = withGuard(dbRoute(async (req) => { ... }))
import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import {
  AUTH_ERRORS,
  COMMON_ERRORS,
  createApiError,
  type Handler,
} from '@pi/guard'
import { getSupabaseAdmin, resolveDbConfig, type UserRow } from '@pi/db'
import { getSessionUser, isAdmin } from './auth'

export const apiError = createApiError({
  ...COMMON_ERRORS,
  ...AUTH_ERRORS,
  DB_UNAVAILABLE: '데이터베이스에 연결할 수 없습니다. 잠시 후 다시 시도하세요',
  NOT_FOUND: '대상을 찾을 수 없습니다',
  // Google 로그인 ↔ Pi 계정 연동(sql/001)
  AUTH_GOOGLE_REQUIRED: 'Google 로그인이 필요합니다',
  LINK_CODE_INVALID:
    '연동 코드가 올바르지 않거나 만료되었습니다. Pi Browser 에서 다시 발급하세요',
  LINK_ALREADY_LINKED: '이미 연동된 계정입니다',
  LINK_CODE_GEN_FAILED:
    '연동 코드를 만들지 못했습니다. 잠시 후 다시 시도하세요',
})

export const db = () => getSupabaseAdmin()

// DB 자격증명 미설정 → 503(빈 화면·크래시 대신 명확한 오류). 처리 중 예외 → 500
export function dbRoute(handler: Handler): Handler {
  return async (req, ctx) => {
    const { url, key } = resolveDbConfig()
    if (!url || !key) return apiError('DB_UNAVAILABLE', 503)
    try {
      return await handler(req, ctx)
    } catch (e) {
      console.error('[api]', req.nextUrl.pathname, e)
      return apiError('INTERNAL', 500)
    }
  }
}

// PostgREST 오류 분류 — 연결 실패(code 없음)·스키마/테이블 미노출(PGRST1xx/2xx·42P01·42883)은 503, 그 외 500
export function dbFail(error: { code?: string; message?: string }) {
  const code = error.code ?? ''
  console.error('[db]', code, error.message)
  const unavailable =
    !code || /^PGRST[12]/.test(code) || code === '42P01' || code === '42883'
  return unavailable
    ? apiError('DB_UNAVAILABLE', 503)
    : apiError('QUERY_FAILED', 500)
}

// 로그인 필수 — null 이면 401 응답(redirect 아님, 클라이언트 게이트가 처리)
export async function requireUser(
  req: NextRequest,
): Promise<UserRow | NextResponse> {
  const user = await getSessionUser(req)
  return user ?? apiError('AUTH_PI_REQUIRED', 401)
}

export async function requireAdmin(
  req: NextRequest,
): Promise<UserRow | NextResponse> {
  const user = await getSessionUser(req)
  if (!user) return apiError('AUTH_PI_REQUIRED', 401)
  return isAdmin(user) ? user : apiError('FORBIDDEN', 403)
}

// 본문 JSON 파싱 + zod 검증 — 실패 시 400 응답
export async function parseBody<T>(
  req: NextRequest,
  schema: {
    safeParse: (v: unknown) => { success: true; data: T } | { success: false }
  },
): Promise<T | NextResponse> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }
  const parsed = schema.safeParse(raw)
  return parsed.success ? parsed.data : apiError('INVALID_INPUT', 400)
}
