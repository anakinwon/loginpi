import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import {
  getUserConsents,
  recordConsents,
  REQUIRED_CONSENTS,
  CONSENT_VER,
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
  const { terms, privacy, marketing } = body as {
    terms?: boolean
    privacy?: boolean
    marketing?: boolean
  }

  // 필수 동의 검증 (서버 강제 — 클라이언트 우회 차단)
  if (terms !== true || privacy !== true) {
    return NextResponse.json(
      { error: '이용약관과 개인정보 수집·이용 동의는 필수입니다' },
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
    ],
    { ip, ua },
  )
  if (!result.ok) {
    return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
