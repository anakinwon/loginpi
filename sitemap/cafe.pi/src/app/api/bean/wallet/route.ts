import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getBalance, listBeanTxns } from '@/lib/bean'
import { apiError } from '@/lib/api-errors'

// GET /api/bean/wallet — 내 Bean 잔액 + 거래 내역
// getSessionUser()만 사용 → Pi(쿠키/헤더)·Google 세션 양쪽 자동 지원
export async function GET() {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const [balance, { txns, total }] = await Promise.all([
    getBalance(user.id),
    listBeanTxns(user.id),
  ])
  return NextResponse.json({ balance, txns, total })
}
