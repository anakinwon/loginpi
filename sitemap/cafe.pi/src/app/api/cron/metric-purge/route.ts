import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// 모니터링 계측 보존 정리 cron (1일 1회) — PRD_22 §9.3 확정: 보존 7일
// sys_metric_*(req_perf·req_ip·auth·conn)는 무한 증가 테이블이라 보존 정책이 없으면
// 용량·인덱스가 계속 커진다 → fn_metric_purge(sql/170)가 7일 이전 행을 물리 정리한다.

const KEEP_DAYS = 7

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data, error } = await getSupabaseAdmin().rpc('fn_metric_purge', {
    p_keep_days: KEEP_DAYS,
  })

  if (error) {
    console.error('[cron/metric-purge] 계측 보존 정리 실패:', error.message)
    return NextResponse.json(
      { ok: false, error: 'metric_purge_failed' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, keepDays: KEEP_DAYS, purged: data })
}
