import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { subscribeProduct } from '@/lib/bean-subscr'
import { recordUserAction } from '@/lib/event'
import {
  SUBSCR_PRODUCTS,
  type SubscrProduct,
  type SubscrGrade,
  type SubscrCycle,
} from '@/lib/bean-subscr-plan'
import { withGuard } from '@/lib/api-guard'

const GRADES: SubscrGrade[] = ['GENERAL', 'S', 'M', 'L']
const CYCLES: SubscrCycle[] = ['M', 'Y']

// POST /api/subscriptions/products/subscribe — 상품 구독 결제(Bean SPEND).
// 금액은 서버(bean-subscr-plan.ts)가 결정 — 클라이언트는 {product, grade, cycle}만 전달.
// 잔액 부족 시 402 → /bean 충전 유도. Pi 결제 아님 → window.Pi 불필요.
async function handlePOST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }
  const { product, grade, cycle } = body as {
    product?: string
    grade?: string
    cycle?: string
  }

  if (
    !SUBSCR_PRODUCTS.includes(product as SubscrProduct) ||
    !GRADES.includes(grade as SubscrGrade) ||
    !CYCLES.includes(cycle as SubscrCycle)
  ) {
    return NextResponse.json({ error: '잘못된 구독 요청' }, { status: 400 })
  }

  const slug = String(user.display_name ?? 'user').slice(0, 20)
  const result = await subscribeProduct({
    usrId: user.id,
    product: product as SubscrProduct,
    grade: grade as SubscrGrade,
    cycle: cycle as SubscrCycle,
    regrId: slug,
  })

  if (!result.ok) {
    if (result.error === 'INSUFFICIENT_BEAN')
      return NextResponse.json({ error: 'INSUFFICIENT_BEAN' }, { status: 402 })
    if (result.error === 'INVALID_PLAN')
      return NextResponse.json(
        { error: '존재하지 않는 구독 상품' },
        { status: 404 },
      )
    return NextResponse.json({ error: '구독 처리 실패' }, { status: 500 })
  }

  // 구독 신청 미션 기록 (비블로킹)
  recordUserAction('subscr_apply', user.id, { product, grade, cycle }).catch(
    (err) => console.error(`[구독] 미션 기록 실패: ${err.message}`),
  )

  return NextResponse.json({
    ok: true,
    balance: result.balance,
    expire_dtm: result.expire_dtm,
  })
}

export const POST = withGuard(handlePOST)
