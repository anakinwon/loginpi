import { NextResponse } from 'next/server'
import { cookies, headers } from 'next/headers'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { signPayload, verifyPayload } from '@/lib/pi-session-crypto'
import { recordUserAction } from '@/lib/event'
import type { PiSessionUser } from '@/types/pi-session'

const ProfileUpdateSchema = z.object({
  display_name: z.string().min(1).max(50).optional(),
  real_nm: z.string().max(50).optional(),
  nick_nm: z.string().max(30).optional(),
  phone_no: z.string().max(20).optional(),
  addr: z.string().max(200).optional(),
  addr_dtl: z.string().max(100).optional(),
  // PiTranslate™ 표시 언어 — locale 코드 화이트리스트 검증 (코드 인젝션 방지)
  display_locale_cd: z
    .string()
    .regex(/^[a-z]{2,3}(-[A-Z]{2,3})?$/)
    .optional(),
  kakao_id: z.string().max(50).optional(),
  self_intro: z.string().max(500).optional(),
})

export async function GET() {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

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
    return NextResponse.json({ error: '프로필 조회 실패' }, { status: 500 })
  }

  return NextResponse.json({ user: data })
}

export async function PATCH(req: Request) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const parsed = ProfileUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('sys_user')
    .update({
      ...parsed.data,
      modr_id: user.id,
      mod_dtm: new Date().toISOString(),
    })
    .eq('id', user.id)
    .select(
      'id, display_name, real_nm, nick_nm, phone_no, addr, addr_dtl, display_locale_cd, kakao_id, self_intro, pi_username, google_email, role, reg_dtm',
    )
    .maybeSingle()

  if (error)
    return NextResponse.json({ error: '프로필 저장 실패' }, { status: 500 })

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

  // M2: 별명 + 카톡ID 입력 미션 기록 (둘 다 있어야 함)
  if (data?.nick_nm && data?.kakao_id) {
    recordUserAction('profile_update', user.id)
      .catch(err => console.error(`[M2] 미션 기록 실패: ${err.message}`))
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
