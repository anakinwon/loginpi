import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

// 배치 실행 이력 조회 — CRON·수동·백필 전체
export async function GET(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return apiError('FORBIDDEN', 403)
  }

  const limitParam = Number(req.nextUrl.searchParams.get('limit'))
  const limit =
    Number.isInteger(limitParam) && limitParam > 0 && limitParam <= 200
      ? limitParam
      : 50

  const { data, error } = await getSupabaseAdmin()
    .from('sys_batch_log')
    .select(
      'batch_log_id, job_nm, trigger_cd, from_dt, to_dt, start_dtm, end_dtm, success_yn, total_cnt, failed_cnt, result_msg, regr_id',
    )
    .eq('del_yn', 'N')
    .order('start_dtm', { ascending: false })
    .limit(limit)

  if (error) {
    return apiError('ADM_BATCH_LOG_FAILED', 500)
  }

  return NextResponse.json({ logs: data })
}
