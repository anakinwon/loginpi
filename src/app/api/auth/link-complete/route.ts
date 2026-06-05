import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { upsertGoogleUser, linkGoogleToPiUser } from '@/lib/users'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// POST /api/auth/link-complete
// Body: { code: string }  — Pi Browser가 생성한 6자리 코드
// 일반 브라우저에서 Google 세션을 가진 채로 호출
export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const { code } = body as { code?: string }
  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: '유효한 6자리 코드를 입력해주세요' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data: linkCode, error: fetchErr } = await supabase
    .from('link_codes')
    .select('pi_user_id, expires_at, used_at, attempt_count')
    .eq('code', code)
    .single()

  if (fetchErr || !linkCode) {
    return NextResponse.json({ error: '유효하지 않은 코드입니다' }, { status: 400 })
  }
  if (linkCode.used_at) {
    return NextResponse.json({ error: '이미 사용된 코드입니다' }, { status: 400 })
  }
  if (new Date(linkCode.expires_at) < new Date()) {
    return NextResponse.json({ error: '코드가 만료됐습니다 (10분 초과)' }, { status: 400 })
  }

  // 5회 이상이면 차단
  const MAX_ATTEMPTS = 5
  if (linkCode.attempt_count >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: '시도 횟수 초과로 코드가 무효화됐습니다. Pi Browser에서 새 코드를 생성하세요.' }, { status: 400 })
  }

  // Google 세션 여부와 무관하게 시도 즉시 카운트 증가
  // — Google 로그인 상태에서 브루트포스 시 카운터를 우회하는 경로 차단
  await supabase
    .from('link_codes')
    .update({ attempt_count: linkCode.attempt_count + 1 })
    .eq('code', code)

  const googleSession = await auth()
  if (!googleSession?.user) {
    return NextResponse.json({ error: 'Google 로그인이 필요합니다' }, { status: 401 })
  }

  const googleSub = googleSession.user.sub ?? googleSession.user.id
  const googleEmail = googleSession.user.email
  if (!googleEmail) {
    return NextResponse.json({ error: 'Google 이메일 정보가 없습니다' }, { status: 400 })
  }

  try {
    const googleDbUser = await upsertGoogleUser({
      id: googleSub,
      email: googleEmail,
      name: googleSession.user.name ?? null,
      image: googleSession.user.image ?? null,
    })

    await linkGoogleToPiUser(linkCode.pi_user_id, googleDbUser.id)

    // 1회 사용 처리
    await supabase
      .from('link_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('code', code)

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : '계정 연동 실패'
    console.error('[link-complete]', message, err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
