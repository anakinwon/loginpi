import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const DEST_WALLETS = ['REWARD_POOL', 'PLATFORM', 'FOUNDATION'] as const

// POST /api/admin/token/mint — 프로모션 Bean 발행(거버넌스 지갑 충전). 관리자 전용.
// 현금(Pi) 없는 보조금성 발행 — bean_mint_log 기록 + 대차대조표 발행 총량에 포함.
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    bean_amt?: number
    dest_wallet?: string
    reason?: string
  }

  const amt = Math.floor(Number(body.bean_amt))
  if (!Number.isInteger(amt) || amt <= 0) {
    return NextResponse.json(
      { error: '발행액(bean_amt)은 1 이상의 정수여야 합니다' },
      { status: 400 },
    )
  }
  const dest = body.dest_wallet ?? 'REWARD_POOL'
  if (!(DEST_WALLETS as readonly string[]).includes(dest)) {
    return NextResponse.json(
      { error: `dest_wallet은 ${DEST_WALLETS.join(', ')} 중 하나여야 합니다` },
      { status: 400 },
    )
  }
  const reason = (body.reason ?? '').trim()
  if (!reason) {
    return NextResponse.json(
      { error: '발행 사유(reason)는 필수입니다' },
      { status: 400 },
    )
  }

  const { data, error } = await getSupabaseAdmin().rpc('fn_bean_mint', {
    p_bean_amt: amt,
    p_dest_wallet: dest,
    p_reason: reason.slice(0, 200),
    p_regr_id: user!.id,
  })
  if (error) {
    console.error('[token/mint] 발행 실패:', error.message)
    return NextResponse.json({ error: '발행 처리 실패' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, dest_wallet: dest, balance: data })
}
