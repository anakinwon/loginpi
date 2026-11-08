import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { BEAN_PER_PI, beanToPi } from '@/lib/bean'
import type { ActivePymntType } from '@/lib/txn-div'
import { withGuard } from '@/lib/api-guard'
import { apiError } from '@/lib/api-errors'

// POST /api/bean/charge — 충전 준비: Pi SDK createPayment 파라미터 반환
// 실제 적립은 /api/payments/complete의 BEAN_CHARGE 분기에서 fn_bean_apply로 처리
async function handlePOST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }

  const beanAmt = Number((body as { bean_amt?: unknown }).bean_amt)

  // 정수 전용 검증 — 소수점 Bean 차단
  if (!Number.isInteger(beanAmt) || beanAmt < BEAN_PER_PI) {
    return apiError('BEAN_MIN_CHARGE', 400, { min: BEAN_PER_PI })
  }

  const amountPi = beanToPi(beanAmt)
  // type을 ActivePymntType으로 고정 — 거래구분(txn-div) 단일 소스와 발행 측을 묶어,
  // 결제 타입 변경 시 거래구분 매핑 누락을 컴파일 타임에 차단한다.
  const metadata: { type: ActivePymntType; bean_amt: number } = {
    type: 'BEAN_CHARGE',
    bean_amt: beanAmt, // complete 분기에서 결제금액과 교차검증
  }
  return NextResponse.json({
    amount: amountPi,
    memo: `Bean ${beanAmt.toLocaleString()} 충전 (${amountPi}π)`,
    metadata,
  })
}

export const POST = withGuard(handlePOST)
