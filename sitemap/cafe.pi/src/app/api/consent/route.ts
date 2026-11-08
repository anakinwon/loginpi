import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { recordUserAction } from '@/lib/event'
import { apiError, API_ERRORS } from '@/lib/api-errors'
import {
  getUserConsents,
  recordConsents,
  syncLbsConsent,
  calcAge,
  REQUIRED_CONSENTS,
  CONSENT_VER,
  LBS_CONSENT_VER,
  MIN_AGE,
} from '@/lib/consent'

// 가입/이용 동의 — 통합로그인·매장등록 등 전역에서 사용.
// GET: 현재 사용자의 필수 동의 완료 여부. POST: 동의 기록(필수 미동의 시 거부).

export async function GET() {
  const user = await getSessionUser()
  // 비로그인은 게이트 비표시 — 200 + authenticated:false (클라이언트가 안전 처리)
  if (!user) {
    return NextResponse.json({ authenticated: false, requiredDone: true })
  }
  const consents = await getUserConsents(user.id)
  const requiredDone = REQUIRED_CONSENTS.every((t) => consents[t] === true)
  return NextResponse.json({
    authenticated: true,
    consents,
    requiredDone,
    ver: CONSENT_VER,
  })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return apiError('AUTH_REQUIRED', 401)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }
  const { terms, privacy, marketing, lbs, birth, guardian } = body as {
    terms?: boolean
    privacy?: boolean
    marketing?: boolean
    lbs?: boolean
    birth?: string
    guardian?: boolean
  }

  // 필수 동의 검증 (서버 강제 — 클라이언트 우회 차단)
  if (terms !== true || privacy !== true || lbs !== true) {
    return apiError('CONSENT_REQUIRED_MISSING', 400)
  }

  // 연령 게이트 — 생년월일로 만 나이 서버 재계산(클라이언트 신뢰 안 함)
  const age = typeof birth === 'string' ? calcAge(birth) : null
  if (age === null) {
    return apiError('CONSENT_BIRTH_INVALID', 400)
  }
  // 만 14세 미만은 법정대리인(보호자) 동의 필수
  const isMinor = age < MIN_AGE
  if (isMinor && guardian !== true) {
    // 부가 필드(requireGuardian) 동반 → apiError 대신 수동 구성 + code·params 첨부
    return NextResponse.json(
      {
        error: API_ERRORS.CONSENT_GUARDIAN_REQUIRED.replaceAll(
          '{age}',
          String(MIN_AGE),
        ),
        code: 'CONSENT_GUARDIAN_REQUIRED',
        params: { age: MIN_AGE },
        requireGuardian: true,
      },
      { status: 400 },
    )
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip')
  const ua = req.headers.get('user-agent')

  const result = await recordConsents(
    user.id,
    [
      { tp: 'TERMS', yn: true },
      { tp: 'PRIVACY', yn: true },
      { tp: 'MKT', yn: marketing === true },
      { tp: 'AGE14', yn: true }, // 연령 게이트 통과(≥14 또는 보호자 동의)
      { tp: 'GUARDIAN', yn: isMinor }, // 만 14세 미만 법정대리인 동의 여부
    ],
    { ip, ua },
  )
  if (!result.ok) {
    return apiError('SAVE_FAILED', 500)
  }

  // 위치(LBS) 동의 즉시 동기화 — sys_user 캐시 세팅으로 가까운 카페/지도 즉시 활성, 별도 다이얼로그 미표시
  const lbsSync = await syncLbsConsent(user.id, { ip, ua })
  if (!lbsSync.ok) {
    return apiError('CONSENT_LBS_SAVE_FAILED', 500)
  }
  // M9: 위치기반서비스 동의 미션 기록 (비블로킹 — 기존 LBS 라우트와 동일 동작)
  recordUserAction('lbs_consent', user.id, {
    consent_ver: LBS_CONSENT_VER,
  }).catch((err) => console.error(`[M9] 미션 기록 실패: ${err.message}`))

  return NextResponse.json({ ok: true })
}
