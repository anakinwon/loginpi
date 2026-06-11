import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getBondStatus, BOND_DEPOSIT_PI } from '@/lib/mps-bond'

// GET /api/store/bond — 내 보증금 상태 (잔액·가용·취소 횟수)
export async function GET() {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const bond = await getBondStatus(user.id)
  return NextResponse.json({ bond })
}

// POST /api/store/bond — 예치 준비: Pi SDK createPayment 파라미터 반환
// 실제 적립은 /api/payments/complete의 MPS_BOND 분기에서 처리
export async function POST() {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  return NextResponse.json({
    amount: BOND_DEPOSIT_PI,
    memo: '🛡️ MyPiShop 판매자 보증금 예치 (1π = 취소수수료 9회분 + 지급준비금 0.1π)',
    metadata: { type: 'MPS_BOND' },
  })
}
