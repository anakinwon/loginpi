import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { reevaluateAllActiveUsers } from '@/lib/event'

// 미션 재평가 안전망 cron (매일 00:00 UTC).
// recordUserAction의 after() 실시간 평가가 유실/지연된 경우를 주기적으로 복구한다.
// evaluateUserMissions(멱등 upsert)를 전체 활성 사용자에 돌리므로 중복 실행해도 안전하고,
// 모든 미션 타입(SINGLE/MULTI_AND/MULTI_OR/SEQUENCE)을 정식 로직으로 빠짐없이 평가한다.
// → "혜택 누락 사용자 0" 보장의 핵심 안전망.

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

async function logBatchRun(
  start: Date,
  total: number,
  failed: number,
  msg: string,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const { error } = await getSupabaseAdmin()
    .from('sys_batch_log')
    .insert({
      job_nm: 'event_reeval',
      trigger_cd: 'CRON',
      from_dt: today,
      to_dt: today,
      start_dtm: start.toISOString(),
      end_dtm: new Date().toISOString(),
      success_yn: failed === 0 ? 'Y' : 'N',
      total_cnt: total,
      failed_cnt: failed,
      result_msg: msg,
      regr_id: 'SYSTEM',
      modr_id: 'SYSTEM',
    })
  if (error) console.error('[event-reeval] logBatchRun 실패:', error)
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const start = new Date()
  try {
    const result = await reevaluateAllActiveUsers()
    const total = (result as { evaluated?: number }).evaluated ?? 0
    await logBatchRun(start, total, 0, `evaluated=${total}`)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/event-reeval] 재평가 실패:', err)
    const msg = err instanceof Error ? err.message : 'reeval_failed'
    await logBatchRun(start, 0, 1, msg)
    return NextResponse.json(
      { ok: false, error: 'reeval_failed' },
      { status: 500 },
    )
  }
}
