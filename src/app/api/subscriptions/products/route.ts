import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getBalance } from '@/lib/bean'
import { getMySubscriptions, getMyItemCount } from '@/lib/bean-subscr'
import { SUBSCR_PLANS } from '@/lib/bean-subscr-plan'

// GET /api/subscriptions/products — 구독 상품 목록 + 내 활성 구독 + Bean 잔액 + 내 상품 수
// 신규 상품별 구독(현행 tier 대체). getSessionUser만 사용 → Pi/Google 세션 자동 지원.
export async function GET() {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const [balance, mySubs, itemCount] = await Promise.all([
    getBalance(user.id),
    getMySubscriptions(user.id),
    getMyItemCount(user.id),
  ])

  return NextResponse.json({
    plans: SUBSCR_PLANS,
    mySubs,
    balance,
    itemCount,
  })
}
