import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const CAMPAIGN_CD = 'SHOP_ONBOARD'

// GET /api/campaign/status — 매장 온보딩 캠페인 자격 현황 + 선착순 잔여
export async function GET() {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const db = getSupabaseAdmin()
  const [campRes, shopRes, itemRes, userRes, missionRes, grantRes, cntRes] =
    await Promise.all([
      db
        .from('bean_campaign')
        .select('*')
        .eq('campaign_cd', CAMPAIGN_CD)
        .maybeSingle(),
      db
        .from('mps_shop')
        .select('shop_id', { count: 'exact', head: true })
        .eq('seller_id', user.id)
        .eq('del_yn', 'N'),
      db
        .from('mps_item')
        .select('item_id', { count: 'exact', head: true })
        .eq('seller_id', user.id)
        .eq('del_yn', 'N'),
      db
        .from('sys_user')
        .select('tlgm_conn_yn')
        .eq('id', user.id)
        .maybeSingle(),
      db
        .from('evt_user_mission')
        .select('evt_user_mission_id', { count: 'exact', head: true })
        .eq('usr_id', user.id)
        .eq('del_yn', 'N'),
      db
        .from('bean_campaign_grant')
        .select('grant_id')
        .eq('campaign_cd', CAMPAIGN_CD)
        .eq('usr_id', user.id)
        .eq('del_yn', 'N')
        .maybeSingle(),
      db
        .from('bean_campaign_grant')
        .select('grant_id', { count: 'exact', head: true })
        .eq('campaign_cd', CAMPAIGN_CD)
        .eq('del_yn', 'N'),
    ])

  const camp = campRes.data as {
    campaign_nm: string
    reward_bean: number
    max_grant_cnt: number
    require_shop_yn: string
    require_item_yn: string
    require_telegram_yn: string
    require_mission_cnt: number
    active_yn: string
  } | null
  if (!camp) return NextResponse.json({ error: '캠페인 없음' }, { status: 404 })

  const hasShop = (shopRes.count ?? 0) > 0
  const hasItem = (itemRes.count ?? 0) > 0
  const hasTelegram =
    (userRes.data as { tlgm_conn_yn?: string } | null)?.tlgm_conn_yn === 'Y'
  const missionDone = missionRes.count ?? 0
  const missionOk = missionDone >= camp.require_mission_cnt

  // 조건별 충족 여부 (require가 'Y'/양수일 때만 요구)
  const conditions = {
    shop: camp.require_shop_yn !== 'Y' || hasShop,
    item: camp.require_item_yn !== 'Y' || hasItem,
    telegram: camp.require_telegram_yn !== 'Y' || hasTelegram,
    mission: camp.require_mission_cnt <= 0 || missionOk,
  }
  const eligible = Object.values(conditions).every(Boolean)
  const claimed = !!grantRes.data
  const grantedCnt = cntRes.count ?? 0

  return NextResponse.json({
    campaign_nm: camp.campaign_nm,
    reward_bean: camp.reward_bean,
    require_mission_cnt: camp.require_mission_cnt,
    active: camp.active_yn === 'Y',
    conditions,
    eligible,
    claimed,
    granted_cnt: grantedCnt,
    max_cnt: camp.max_grant_cnt,
    sold_out: grantedCnt >= camp.max_grant_cnt,
  })
}
