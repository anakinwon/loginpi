import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const db = getSupabaseAdmin()

  // 병렬 집계: 발행(충전+프로모션)·유통·4종 거버넌스 지갑·일별 트렌드·보상 지급+출처별 분해
  const [chargeRes, mintRes, circulatingRes, govWalletsRes, dailyRes, rewardRes, campaignRes] =
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
      // 보상 지급 누계 = REWARD 거래 + 출처별 분해 (ref_tp_cd / ref_id)
      db
        .from('bean_txn')
        .select('bean_amt, ref_tp_cd, ref_id')
        .eq('txn_tp_cd', 'REWARD')
        .eq('del_yn', 'N'),
      // 캠페인 이름 조회 (ref_id → 표시명 변환용)
      db
        .from('bean_campaign')
        .select('campaign_cd, campaign_nm')
        .eq('del_yn', 'N'),
    ])

  const chargeIssued = (chargeRes.data ?? []).reduce(
    (s, r) => s + Number(r.bean_amt),
    0,
  )
  const mintIssued = (mintRes.data ?? []).reduce(
    (s, r) => s + Number(r.bean_amt),
    0,
  )

  // 보상 지급 누계 + 출처별(이벤트/캠페인) 분해
  const campaignNameMap = new Map(
    (campaignRes.data ?? []).map((c) => [
      c.campaign_cd as string,
      c.campaign_nm as string,
    ]),
  )

  type RewardRow = { bean_amt: number; ref_tp_cd: string | null; ref_id: string | null }
  const rewardRows = (rewardRes.data ?? []) as RewardRow[]
  const rewardGranted = rewardRows.reduce((s, r) => s + Number(r.bean_amt), 0)

  // ref_tp_cd + ref_id 조합별 합산 — 이벤트 #1 / 이벤트 #2 구분
  const srcMap = new Map<string, { label: string; bean: number; order: number }>()
  for (const r of rewardRows) {
    const key = `${r.ref_tp_cd ?? ''}:${r.ref_id ?? ''}`
    if (!srcMap.has(key)) {
      let label: string
      let order: number
      if (r.ref_tp_cd === 'EVENT_REWARD') {
        label = '이벤트 #1 · 오픈베타 미션 완주'
        order = 1
      } else if (r.ref_tp_cd === 'CAMPAIGN') {
        const nm = campaignNameMap.get(r.ref_id ?? '') ?? r.ref_id ?? '알 수 없음'
        // SHOP_ONBOARD = 이벤트 #2, 이후 캠페인은 이름 그대로 표시
        label =
          r.ref_id === 'SHOP_ONBOARD'
            ? `이벤트 #2 · ${nm}`
            : `캠페인 · ${nm}`
        order = r.ref_id === 'SHOP_ONBOARD' ? 2 : 99
      } else {
        label = r.ref_tp_cd ?? '기타'
        order = 100
      }
      srcMap.set(key, { label, bean: 0, order })
    }
    const cur = srcMap.get(key)!
    cur.bean += Number(r.bean_amt)
  }

  const rewardBreakdown = [...srcMap.values()]
    .sort((a, b) => a.order - b.order || b.bean - a.bean)
    .map(({ label, bean }) => ({ label, bean }))
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
  // 항등식: 발행 = 유통 + 총회수. Bean은 정수(BIGINT)이고 거버넌스 분배는 잔차를 FOUNDATION에
  // 귀속(fn_bean_governance_apply)하므로 반올림 손실이 0 → diff는 반드시 정확히 0이어야 한다.
  // 무관용원칙: 1 Bean이라도 어긋나면 누수로 간주(허용 오차 없음).
  const identityOk = totalIssued - circulating - totalCollected === 0

  return NextResponse.json({
    kpi: {
      // 공급량
      total_issued_bean: totalIssued,
      total_issued_pi: totalIssued / 100,
      // 발행 분해: 충전(현금) vs 프로모션·보상(mint)
      charge_issued_bean: chargeIssued,
      mint_issued_bean: mintIssued,
      // 보상 지급 누계 (REWARD 거래 — 이벤트·캠페인 지급액)
      reward_granted_bean: rewardGranted,
      reward_breakdown: rewardBreakdown,
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
