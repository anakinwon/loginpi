import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { BEAN_PER_PI, beanToPi } from '@/lib/bean'

// POST /api/bean/charge — 충전 준비: Pi SDK createPayment 파라미터 반환
// 실제 적립은 /api/payments/complete의 BEAN_CHARGE 분기에서 fn_bean_apply로 처리
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const beanAmt = Number((body as { bean_amt?: unknown }).bean_amt)

  // 정수 전용 검증 — 소수점 Bean 차단
  if (!Number.isInteger(beanAmt) || beanAmt < BEAN_PER_PI) {
    return NextResponse.json(
      { error: `최소 ${BEAN_PER_PI} Bean(1π)부터 정수로 충전할 수 있습니다` },
      { status: 400 },
    )
  }

  const amountPi = beanToPi(beanAmt)
  return NextResponse.json({
    amount: amountPi,
    memo: `☕ Bean ${beanAmt.toLocaleString()} 충전 (${amountPi}π)`,
    // bean_amt를 메타데이터에 박아 complete 분기에서 결제금액과 교차검증
    metadata: { type: 'BEAN_CHARGE', bean_amt: beanAmt },
  })
}
