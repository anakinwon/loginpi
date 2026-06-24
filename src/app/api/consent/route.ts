import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import {
  getUserConsents,
  recordConsents,
  calcAge,
  REQUIRED_CONSENTS,
  CONSENT_VER,
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
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }
  const { terms, privacy, marketing, birth, guardian } = body as {
    terms?: boolean
    privacy?: boolean
    marketing?: boolean
    birth?: string
    guardian?: boolean
  }

  // 필수 동의 검증 (서버 강제 — 클라이언트 우회 차단)
  if (terms !== true || privacy !== true) {
    return NextResponse.json(
      { error: '이용약관과 개인정보 수집·이용 동의는 필수입니다' },
      { status: 400 },
    )
  }

  // 연령 게이트 — 생년월일로 만 나이 서버 재계산(클라이언트 신뢰 안 함)
  const age = typeof birth === 'string' ? calcAge(birth) : null
  if (age === null) {
    return NextResponse.json(
      { error: '생년월일을 올바르게 입력해 주세요' },
      { status: 400 },
    )
  }
  // 만 14세 미만은 법정대리인(보호자) 동의 필수
  const isMinor = age < MIN_AGE
  if (isMinor && guardian !== true) {
    return NextResponse.json(
      {
        error: `만 ${MIN_AGE}세 미만은 법정대리인(보호자)의 동의가 필요합니다`,
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
    return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
