import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getBalance } from '@/lib/bean'
import { getMySubscriptions, getMyItemCount } from '@/lib/bean-subscr'
import { getSubscrPlans } from '@/lib/bean-fee-db'
import { apiError } from '@/lib/api-errors'

// GET /api/subscriptions/products — 구독 상품 목록(DB) + 내 활성 구독 + Bean 잔액 + 내 상품 수
export async function GET() {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const [plans, balance, mySubs, itemCount] = await Promise.all([
    getSubscrPlans(),
    getBalance(user.id),
    getMySubscriptions(user.id),
    getMyItemCount(user.id),
  ])

  return NextResponse.json({ plans, mySubs, balance, itemCount })
}
