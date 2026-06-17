import { NextRequest, NextResponse } from 'next/server'
import { reevaluateAllActiveUsers } from '@/lib/event'

// 미션 재평가 안전망 cron.
// recordUserAction의 after() 실시간 평가가 유실/지연된 경우를 주기적으로 복구한다.
// evaluateUserMissions(멱등 upsert)를 전체 활성 사용자에 돌리므로 중복 실행해도 안전하고,
// 모든 미션 타입(SINGLE/MULTI_AND/MULTI_OR/SEQUENCE)을 정식 로직으로 빠짐없이 평가한다.
// → "혜택 누락 사용자 0" 보장의 핵심 안전망.

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const result = await reevaluateAllActiveUsers()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/event-reeval] 재평가 실패:', err)
    return NextResponse.json(
      { ok: false, error: 'reeval_failed' },
      { status: 500 },
    )
  }
}
