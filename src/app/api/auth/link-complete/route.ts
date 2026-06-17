import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { updatePiUserWithGoogle } from '@/lib/users'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { recordUserAction } from '@/lib/event'

// POST /api/auth/link-complete
// Body: { code: string }
// 일반 브라우저에서 Google 세션을 가진 채로 호출 → Pi row에 Google 필드 UPDATE
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const { code } = body as { code?: string }
  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { error: '유효한 6자리 코드를 입력해주세요' },
      { status: 400 },
    )
  }

  const supabase = getSupabaseAdmin()

  const { data: linkCode, error: fetchErr } = await supabase
    .from('auth_link_cd')
    .select('pi_user_id, expires_at, used_at, attempt_count')
    .eq('code', code)
    .single()

  if (fetchErr || !linkCode) {
    return NextResponse.json(
      { error: '유효하지 않은 코드입니다' },
      { status: 400 },
    )
  }
  if (linkCode.used_at) {
    return NextResponse.json(
      { error: '이미 사용된 코드입니다' },
      { status: 400 },
    )
  }
  if (new Date(linkCode.expires_at) < new Date()) {
    return NextResponse.json(
      { error: '코드가 만료됐습니다 (10분 초과)' },
      { status: 400 },
    )
  }
  if (linkCode.attempt_count >= 5) {
    return NextResponse.json(
      {
        error:
          '시도 횟수 초과로 코드가 무효화됐습니다. Pi Browser에서 새 코드를 생성하세요.',
      },
      { status: 400 },
    )
  }

  // 시도 횟수 즉시 증가 (브루트포스 방지)
  await supabase
    .from('auth_link_cd')
    .update({ attempt_count: linkCode.attempt_count + 1 })
    .eq('code', code)

  const googleSession = await auth()
  if (!googleSession?.user) {
    return NextResponse.json(
      { error: 'Google 로그인이 필요합니다' },
      { status: 401 },
    )
  }

  // Google OAuth sub를 google_id로 사용 (JWT token.sub = Google raw sub)
  const googleSub = googleSession.user.sub
  if (!googleSub) {
    return NextResponse.json(
      { error: 'Google 인증 정보가 없습니다' },
      { status: 400 },
    )
  }
  if (!googleSession.user.email) {
    return NextResponse.json(
      { error: 'Google 이메일 정보가 없습니다' },
      { status: 400 },
    )
  }

  try {
    // Pi row에 Google 필드 직접 UPDATE — 별도 row 생성 없음
    await updatePiUserWithGoogle(linkCode.pi_user_id, {
      id: googleSub,
      email: googleSession.user.email,
      name: googleSession.user.name ?? null,
      image: googleSession.user.image ?? null,
    })

    await supabase
      .from('auth_link_cd')
      .update({ used_at: new Date().toISOString() })
      .eq('code', code)

    // M1: 계정 통합 미션 기록 (MULTI_AND: account_link + google_link 둘 다 필요)
    // 연동은 이 시점에 원자적으로 성립하므로 두 행위를 함께 기록한다 (비블로킹)
    recordUserAction('account_link', linkCode.pi_user_id).catch((err) =>
      console.error(`[M1] account_link 기록 실패: ${err.message}`),
    )
    recordUserAction('google_link', linkCode.pi_user_id).catch((err) =>
      console.error(`[M1] google_link 기록 실패: ${err.message}`),
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : '계정 연동 실패'
    console.error('[link-complete]', message, err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
