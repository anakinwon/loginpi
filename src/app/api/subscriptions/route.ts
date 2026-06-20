import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'

// POST /api/subscriptions — [폐기] 레거시 Pi 구독(CHAT_SUBSCR) 결제 준비.
// PRD_15_FEE §1-6: 플랫폼 요금 Pi 직접결제 폐기 → Bean 구독으로 일원화.
// 구독은 POST /api/subscriptions/products/subscribe (Bean SPEND)를 사용한다.
export function POST() {
  return NextResponse.json(
    {
      error:
        '레거시 Pi 구독은 종료되었습니다. Bean 구독(/subscribe)을 이용해 주세요.',
      code: 'LEGACY_SUBSCR_GONE',
    },
    { status: 410 },
  )
}

// DELETE /api/subscriptions — 구독 자동갱신 해제(취소).
// bean_subscr 활성 구독 전체의 자동갱신을 중단한다. 만료일까지는 이용 유지(부분 환불 없음).
export async function DELETE() {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const db = getSupabaseAdmin()
  const now = new Date().toISOString()
  const slug = String(user.display_name ?? 'user').slice(0, 20)

  // 자동갱신 중인 활성 구독 존재 여부 확인
  const { data: active } = await db
    .from('bean_subscr')
    .select('subscr_id')
    .eq('usr_id', user.id)
    .eq('del_yn', 'N')
    .eq('auto_renew_yn', 'Y')
    .gt('expire_dtm', now)

  if (!active || active.length === 0)
    return NextResponse.json(
      { error: '자동 갱신 중인 구독이 없습니다' },
      { status: 404 },
    )

  const { error } = await db
    .from('bean_subscr')
    .update({ auto_renew_yn: 'N', modr_id: slug, mod_dtm: now })
    .eq('usr_id', user.id)
    .eq('del_yn', 'N')
    .eq('auto_renew_yn', 'Y')
    .gt('expire_dtm', now)

  if (error)
    return NextResponse.json({ error: '구독 취소 실패' }, { status: 500 })

  return NextResponse.json({
    message: '구독이 취소되었습니다. 만료일까지 이용할 수 있습니다.',
  })
}
