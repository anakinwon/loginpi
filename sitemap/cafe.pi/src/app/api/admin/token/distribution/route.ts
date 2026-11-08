import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

// GET /api/admin/token/distribution?period=N — Bean 거래 유형별 분포 (txn_tp_cd 전체)
// 매출(회수) 집계와 달리 CHARGE·REWARD·TRANSFER 까지 포함한 활동 전반의 분포.
// period(일)는 최근 N일 필터로 RPC p_days에 전달 — 없거나 비정상이면 전체 기간(NULL).
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return apiError('FORBIDDEN', 401)
  }

  const periodRaw = request.nextUrl.searchParams.get('period')
  const parsed = periodRaw ? parseInt(periodRaw, 10) : NaN
  const p_days = Number.isFinite(parsed) && parsed > 0 ? parsed : null

  const { data, error } = await getSupabaseAdmin().rpc(
    'fn_bean_txn_distribution',
    { p_days },
  )
  if (error) {
    console.error('[Bean 분포] 집계 실패:', error.message)
    return apiError('ADM_BEAN_DISTRIBUTION_FAILED', 500)
  }

  return NextResponse.json({ ...data, last_updated: new Date().toISOString() })
}
