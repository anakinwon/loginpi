import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/admin/token/distribution — Bean 거래 유형별 분포 (txn_tp_cd 전체)
// 매출(회수) 집계와 달리 CHARGE·REWARD·TRANSFER 까지 포함한 활동 전반의 분포.
export async function GET() {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data, error } = await getSupabaseAdmin().rpc(
    'fn_bean_txn_distribution',
  )
  if (error) {
    console.error('[Bean 분포] 집계 실패:', error.message)
    return NextResponse.json({ error: 'Bean 분포 집계 실패' }, { status: 500 })
  }

  return NextResponse.json({ ...data, last_updated: new Date().toISOString() })
}
