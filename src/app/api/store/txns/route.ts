import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { listTxns } from '@/lib/mps-txn'
import { apiError } from '@/lib/api-errors'

// GET /api/store/txns — 내 거래 내역 (FR-12, 판매자·구매자 통합)
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD 날짜 범위 필터
//   ?all=1 — 관리자 전체 사용자 거래 내역 (FR-12 관리자 요건)
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const sp = req.nextUrl.searchParams
  const wantAll = sp.get('all') === '1' && isAdmin(user)

  // to는 그날 끝까지 포함하도록 23:59:59로 보정
  const fromParam = sp.get('from')
  const toParam = sp.get('to')
  const from = fromParam ? `${fromParam}T00:00:00Z` : undefined
  const to = toParam ? `${toParam}T23:59:59Z` : undefined

  const txns = await listTxns(wantAll ? null : user.id, { from, to })
  return NextResponse.json({ txns })
}
