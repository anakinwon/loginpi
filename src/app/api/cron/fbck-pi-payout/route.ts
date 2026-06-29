import { NextRequest, NextResponse } from 'next/server'
import { payPendingFbckPiRewards } from '@/lib/fbck-pi-reward'

// 후기 보상 Pi A2U 송금 안전망 cron (PRD_24 §0).
// feedback POST의 after() 즉시 송금이 유실/실패한 PENDING·FAILED 건을 주기적으로 재시도한다.
// 멱등: payFbckPiReward가 fbck_id 기준 PAID skip + PENDING 전환 → 중복 송금 없음.

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
    const result = await payPendingFbckPiRewards()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/fbck-pi-payout] 송금 재시도 실패:', err)
    return NextResponse.json(
      { ok: false, error: 'payout_failed' },
      { status: 500 },
    )
  }
}
