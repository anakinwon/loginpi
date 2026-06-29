import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { subscribeProduct } from '@/lib/bean-subscr'
import { recordUserAction } from '@/lib/event'
import { getSubscrPlans } from '@/lib/bean-fee-db'
import { getActiveFeeMode } from '@/lib/fee-resolver'
import type { SubscrProduct, SubscrGrade, SubscrCycle } from '@/lib/bean-subscr-plan'
import { withGuard } from '@/lib/api-guard'

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

  // 기본 형식 검증 후, DB 플랜 존재 여부는 subscribeProduct 내부에서 INVALID_PLAN으로 처리
  if (!product || !grade || !CYCLES.includes(cycle as SubscrCycle)) {
    return NextResponse.json({ error: '잘못된 구독 요청' }, { status: 400 })
  }

  // DB에서 유효한 플랜인지 확인
  const plans = await getSubscrPlans()
  const plan = plans.find(
    (p) => p.product === product && p.grade === grade && p.cycle === cycle,
  )
  if (!plan) {
    return NextResponse.json({ error: '존재하지 않는 구독 상품' }, { status: 404 })
  }

  // ⭐서버 권위 모드 판정 — 클라 feeMode가 stale이어도 여기서 결제 단위를 확정한다.
  //   PI 모드: Bean 차감 금지 → Pi 직결제 파라미터 반환(클라가 window.Pi.createPayment 진행).
  //   BEAN 모드: 기존 Bean 차감. (PRD_24 §0)
  const mode = await getActiveFeeMode()
  if (mode === 'PI') {
    return NextResponse.json({
      mode: 'PI',
      pay: {
        amount: plan.bean_amt / 100, // 1 Pi = 100 Bean
        // memo는 Pi 결제 호환 위해 ASCII 코드값만(™·é 금지)
        memo: `${product} ${grade}/${cycle} subscription`,
        metadata: { type: 'CHAT_SUBSCR', product, grade, cycle },
      },
    })
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
    mode: 'BEAN',
    balance: result.balance,
    expire_dtm: result.expire_dtm,
  })
}

export const POST = withGuard(handlePOST)
