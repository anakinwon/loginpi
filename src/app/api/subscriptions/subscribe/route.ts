import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { recordUserAction } from '@/lib/event'

// POST /api/subscriptions/subscribe — Bean으로 구독 결제(SPEND).
// 차감+구독부여를 fn_bean_subscribe로 원자 처리. Pi 결제 아님 → window.Pi 불필요(일반 브라우저 가능).
// 잔액 부족 시 402 + INSUFFICIENT_BEAN → 클라이언트가 Bean 충전(/bean)으로 유도.
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }
  const { plan_cd } = body as { plan_cd?: string }
  if (!plan_cd)
    return NextResponse.json({ error: 'plan_cd가 필요합니다' }, { status: 400 })

  const slug = String(user.display_name ?? 'user').slice(0, 20)
  const { data, error } = await getSupabaseAdmin().rpc('fn_bean_subscribe', {
    p_usr_id: user.id,
    p_plan_cd: plan_cd,
    p_regr_id: slug,
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('INSUFFICIENT_BEAN'))
      return NextResponse.json(
        { error: 'INSUFFICIENT_BEAN' },
        { status: 402 }, // Payment Required — Bean 부족
      )
    if (msg.includes('PLAN_NOT_FOUND'))
      return NextResponse.json(
        { error: '존재하지 않는 플랜입니다' },
        { status: 404 },
      )
    if (msg.includes('FREE_PLAN'))
      return NextResponse.json(
        { error: '무료 플랜은 결제가 필요하지 않습니다' },
        { status: 400 },
      )
    console.error('[구독] Bean 결제 실패:', msg)
    return NextResponse.json({ error: '구독 처리 실패' }, { status: 500 })
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { out_bal: number; out_expire: string; out_plan: string }
    | undefined

  // M5: 구독 신청 미션 기록 (비블로킹)
  recordUserAction('subscr_apply', user.id, { plan_cd }).catch((err) =>
    console.error(`[M5] subscr_apply 기록 실패: ${err.message}`),
  )

  return NextResponse.json({
    ok: true,
    plan_cd: row?.out_plan ?? plan_cd,
    balance: Number(row?.out_bal ?? 0),
    expire_dtm: row?.out_expire ?? null,
  })
}
