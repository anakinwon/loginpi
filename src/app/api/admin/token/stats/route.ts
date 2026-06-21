import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const db = getSupabaseAdmin()

  // 병렬 집계: 발행(충전+프로모션)·유통·4종 거버넌스 지갑·일별 트렌드
  const [chargeRes, mintRes, circulatingRes, govWalletsRes, dailyRes] =
    await Promise.all([
      // 충전 발행 = CHARGE 거래 합계
      db
        .from('bean_txn')
        .select('bean_amt')
        .eq('txn_tp_cd', 'CHARGE')
        .eq('del_yn', 'N'),
      // 프로모션 발행 = bean_mint_log 합계 (거버넌스 지갑 충전분 — 항등식 유지 위해 발행에 포함)
      db.from('bean_mint_log').select('bean_amt').eq('del_yn', 'N'),
      // 유통량 = USER 지갑 합계
      db
        .from('bean_token_wallet')
        .select('bean_amt')
        .eq('wallet_type', 'USER')
        .eq('del_yn', 'N'),
      // 거버넌스 지갑 3종 (PLATFORM / FOUNDATION / REWARD_POOL)
      db
        .from('bean_token_wallet')
        .select('wallet_type, bean_amt')
        .in('wallet_type', ['PLATFORM', 'FOUNDATION', 'REWARD_POOL'])
        .eq('del_yn', 'N'),
      // 최근 30일 일별 CHARGE 집계
      db.rpc('fn_bean_daily_stats').limit(30),
    ])

  const chargeIssued = (chargeRes.data ?? []).reduce(
    (s, r) => s + Number(r.bean_amt),
    0,
  )
  const mintIssued = (mintRes.data ?? []).reduce(
    (s, r) => s + Number(r.bean_amt),
    0,
  )
  // 총 발행 = 충전(현금) + 프로모션(보조금). 둘 다 유통/회수로 흘러가므로 항등식 좌변에 포함
  const totalIssued = chargeIssued + mintIssued
  const circulating = (circulatingRes.data ?? []).reduce(
    (s, r) => s + Number(r.bean_amt),
    0,
  )

  type GovRow = { wallet_type: string; bean_amt: number }
  const govMap = Object.fromEntries(
    (govWalletsRes.data ?? []).map((r: GovRow) => [
      r.wallet_type,
      Number(r.bean_amt),
    ]),
  )
  const platformBalance = govMap['PLATFORM'] ?? 0
  const foundationBalance = govMap['FOUNDATION'] ?? 0
  const rewardPoolBalance = govMap['REWARD_POOL'] ?? 0

  // 총 회수 = 운영(PLATFORM) + 재단(FOUNDATION) + 생태계기금(REWARD_POOL)
  const totalCollected = platformBalance + foundationBalance + rewardPoolBalance
  // 항등식: 발행 = 유통 + 총회수 (±1 오차 허용, 정수 반올림)
  const identityOk = Math.abs(totalIssued - circulating - totalCollected) <= 1

  return NextResponse.json({
    kpi: {
      // 공급량
      total_issued_bean: totalIssued,
      total_issued_pi: totalIssued / 100,
      circulating_bean: circulating,
      circulating_pi: circulating / 100,
      total_collected_bean: totalCollected,
      total_collected_pi: totalCollected / 100,
      collection_rate_percent:
        totalIssued > 0
          ? Math.round((totalCollected / totalIssued) * 10000) / 100
          : 0,
      // 거버넌스 지갑 (Pi Network 공식 기준)
      platform_balance_bean: platformBalance,
      foundation_balance_bean: foundationBalance,
      reward_pool_balance_bean: rewardPoolBalance,
      // 배분 비율 (발행량 대비)
      platform_pct:
        totalIssued > 0
          ? Math.round((platformBalance / totalIssued) * 10000) / 100
          : 0,
      foundation_pct:
        totalIssued > 0
          ? Math.round((foundationBalance / totalIssued) * 10000) / 100
          : 0,
      reward_pool_pct:
        totalIssued > 0
          ? Math.round((rewardPoolBalance / totalIssued) * 10000) / 100
          : 0,
      // 항등식 검증
      identity_ok: identityOk,
    },
    trends: dailyRes.data ?? [],
    last_updated: new Date().toISOString(),
  })
}
