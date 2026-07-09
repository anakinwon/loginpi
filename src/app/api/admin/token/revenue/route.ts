import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

// GET /api/admin/token/revenue — 매출 항목별 집계 (Pi 현금 + Bean 회수)
export async function GET() {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return apiError('FORBIDDEN', 401)
  }

  const { data, error } = await getSupabaseAdmin().rpc(
    'fn_bean_revenue_summary',
  )
  if (error) {
    console.error('[매출] 집계 실패:', error.message)
    return apiError('ADM_REVENUE_FAILED', 500)
  }

  return NextResponse.json({ ...data, last_updated: new Date().toISOString() })
}
