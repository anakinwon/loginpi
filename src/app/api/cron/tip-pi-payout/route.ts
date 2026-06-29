import { NextRequest, NextResponse } from 'next/server'
import { payPendingTipPiRewards } from '@/lib/tip-pi-reward'

// 카페방 Pi 선물 A2U 송금 안전망 cron (PRD_24 §0).
// complete의 after() 즉시 송금이 유실/실패한 PENDING·FAILED 건을 주기적으로 재시도한다.
// 멱등: payTipPiReward가 payment_id 기준 PAID skip → 중복 송금 없음.

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
    const result = await payPendingTipPiRewards()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/tip-pi-payout] 송금 재시도 실패:', err)
    return NextResponse.json(
      { ok: false, error: 'payout_failed' },
      { status: 500 },
    )
  }
}
