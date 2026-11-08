import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { reevaluateAllActiveUsers } from '@/lib/event'
import { apiError } from '@/lib/api-errors'

// POST /api/admin/event/reeval — 전체 활성 사용자 미션 온디맨드 재평가 (관리자 전용)
//
// Vercel Hobby cron은 하루 1회(자정)만 허용되므로, 그 사이 발생한 행위가
// 실시간 after() 평가에서 누락됐을 때 관리자가 즉시 재평가를 트리거하는 수단.
// reevaluateAllActiveUsers는 evt_action_log 기반으로 전 미션 타입을 멱등 재평가한다.
export async function POST() {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)
  if (!isAdmin(user)) return apiError('FORBIDDEN', 403)

  try {
    const result = await reevaluateAllActiveUsers()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[admin/event/reeval] 재평가 실패:', err)
    return apiError('ADM_EVT_REEVAL_FAILED', 500)
  }
}
