import { NextResponse } from 'next/server'
import { cookies, headers } from 'next/headers'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { signPayload, verifyPayload } from '@/lib/pi-session-crypto'
import { recordUserAction } from '@/lib/event'
import { apiError } from '@/lib/api-errors'
import type { PiSessionUser } from '@/types/pi-session'

const ProfileUpdateSchema = z.object({
  display_name: z.string().min(1).max(50).optional(),
  real_nm: z.string().max(50).optional(),
  nick_nm: z.string().max(30).optional(),
  phone_no: z.string().max(20).optional(),
  addr: z.string().max(200).optional(),
  addr_dtl: z.string().max(100).optional(),
  // PyTranslate™ 표시 언어 — locale 코드 화이트리스트 검증 (코드 인젝션 방지)
  display_locale_cd: z
    .string()
    .regex(/^[a-z]{2,3}(-[A-Z]{2,3})?$/)
    .optional(),
  kakao_id: z.string().max(50).optional(),
  self_intro: z.string().max(500).optional(),
})

export async function GET() {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const { data, error } = await getSupabaseAdmin()
    .from('sys_user')
    .select(
      'id, display_name, real_nm, nick_nm, phone_no, addr, addr_dtl, display_locale_cd, kakao_id, self_intro, pi_username, google_email, role, reg_dtm',
    )
    .eq('id', user.id)
    .maybeSingle()

  // error 무시 시 { user: null } 200 응답 → 클라이언트 게이트가 "로그인이 필요합니다"로 오인
  // (실제 사례: 027 마이그레이션 미적용으로 kakao_id 컬럼 부재 → 인증 정상인데 로그인 오류로 표시)
  if (error || !data) {
    console.error('[profile] 조회 실패:', error?.message ?? 'row 없음')
    return apiError('PROFILE_QUERY_FAILED', 500)
  }

  return NextResponse.json({ user: data })
}

export async function PATCH(req: Request) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }

  const parsed = ProfileUpdateSchema.safeParse(body)
  if (!parsed.success) {
    // zod 필드 오류 상세는 error 필드로 유지 + i18n용 code 첨부
    return NextResponse.json(
      { error: parsed.error.flatten(), code: 'INVALID_INPUT' },
      { status: 400 },
    )
  }

  // 빈 문자열은 null로 정규화 — '지우기'(빈값 전송) 시 DB에 빈 문자열 대신 null 저장.
  // (kakao_id 등 선택 필드를 비우면 null이 되어 M2 hasKakaoId 등 판정과 정합)
  const normalized = Object.fromEntries(
    Object.entries(parsed.data).map(([k, v]) => [k, v === '' ? null : v]),
  )

  const { data, error } = await getSupabaseAdmin()
    .from('sys_user')
    .update({
      ...normalized,
      modr_id: user.id,
      mod_dtm: new Date().toISOString(),
    })
    .eq('id', user.id)
    .select(
      'id, display_name, real_nm, nick_nm, phone_no, addr, addr_dtl, display_locale_cd, kakao_id, self_intro, pi_username, google_email, role, reg_dtm',
    )
    .maybeSingle()

  if (error) return apiError('PROFILE_SAVE_FAILED', 500)

  // Pi 세션인 경우 nick_nm을 반영한 새 토큰 재발급 — 새로고침 후에도 헤더에 즉시 반영됨
  const secret = process.env.PI_SESSION_SECRET
  let newToken: string | undefined
  if (secret) {
    const cookieStore = await cookies()
    const headerStore = await headers()
    const rawToken =
      cookieStore.get('pi_session')?.value ??
      headerStore.get('x-pi-token') ??
      null
    if (rawToken) {
      const piSession = verifyPayload<PiSessionUser>(rawToken, secret)
      if (piSession) {
        newToken = signPayload(
          { ...piSession, nick_nm: data?.nick_nm ?? null },
          secret,
        )
      }
    }
  }

  // M2: 프로필 업데이트 기록 — kakao_id 유무와 무관하게 항상 기록.
  // evaluateUserMissions의 M2 평가가 DB 상태(kakao_id null 여부)를 직접 확인하므로,
  // 여기서 조건 필터링하면 kakao_id 삭제 시 평가 자체가 실행되지 않아 M2 취소가 지연됨.
  if (data) {
    recordUserAction('profile_update', user.id).catch((err) =>
      console.error(`[M2] 미션 기록 실패: ${err.message}`),
    )
  }

  const response = NextResponse.json({
    user: data,
    ...(newToken ? { token: newToken } : {}),
  })
  if (newToken) {
    response.cookies.set('pi_session', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    })
  }
  return response
}
