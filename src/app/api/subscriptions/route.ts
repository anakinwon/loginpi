import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'

// POST /api/subscriptions — 구독 결제 준비.
// 서버가 plan price_pi로 결제 금액을 권위 있게 확정해 Pi createPayment 파라미터를 반환한다.
// (클라이언트가 amount를 조작해도 /payments/complete의 CHAT_SUBSCR 분기에서 재검증됨)
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }
  const { plan_cd } = body as { plan_cd?: string }
  if (!plan_cd) return NextResponse.json({ error: 'plan_cd가 필요합니다' }, { status: 400 })

  const { data: plan } = await getSupabaseAdmin()
    .from('msg_subscr_plan')
    .select('plan_cd, plan_nm, plan_tp_cd, price_pi')
    .eq('plan_cd', plan_cd)
    .eq('use_yn', 'Y')
    .eq('del_yn', 'N')
    .maybeSingle()

  if (!plan) return NextResponse.json({ error: '존재하지 않는 플랜입니다' }, { status: 404 })
  const planRow = plan as {
    plan_cd: string
    plan_nm: string
    plan_tp_cd: string
    price_pi: number
  }

  if (planRow.plan_tp_cd === 'FREE' || planRow.price_pi <= 0) {
    return NextResponse.json({ error: '무료 플랜은 결제가 필요하지 않습니다' }, { status: 400 })
  }

  // Pi createPayment에 그대로 넣을 파라미터 — amount는 서버 권위값
  return NextResponse.json({
    amount: planRow.price_pi,
    memo: `PiCafé 구독: ${planRow.plan_nm}`,
    metadata: { type: 'CHAT_SUBSCR', plan_cd: planRow.plan_cd },
  })
}

// DELETE /api/subscriptions — 구독 취소.
// 자동갱신만 해제하고 결제한 기간(expire_dtm)까지는 이용을 유지한다.
// 즉시 권한 회수(논리삭제)는 환불 정책 확정 + PiRC2 cancel() 연동 시 처리 예정.
export async function DELETE() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const db = getSupabaseAdmin()
  const { data: active } = await db
    .from('msg_subscr')
    .select('subscr_id, expire_dtm')
    .eq('usr_id', user.id)
    .eq('del_yn', 'N')
    .gt('expire_dtm', new Date().toISOString())
    .maybeSingle()

  if (!active) return NextResponse.json({ error: '활성 구독이 없습니다' }, { status: 404 })
  const row = active as { subscr_id: string; expire_dtm: string }

  const { error } = await db
    .from('msg_subscr')
    .update({
      auto_renew_yn: 'N',
      modr_id: user.display_name.slice(0, 20),
      mod_dtm: new Date().toISOString(),
    })
    .eq('subscr_id', row.subscr_id)

  if (error) return NextResponse.json({ error: '구독 취소 실패' }, { status: 500 })

  return NextResponse.json({
    message: '구독이 취소되었습니다. 만료일까지 이용할 수 있습니다.',
    expire_dtm: row.expire_dtm,
  })
}
