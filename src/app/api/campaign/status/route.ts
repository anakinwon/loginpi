import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

const CAMPAIGN_CD = 'SHOP_ONBOARD'

// GET /api/campaign/status — 온보딩 캠페인 현황 (1인 1회, 대표 매장 선택)
export async function GET() {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const db = getSupabaseAdmin()

  const [campRes, shopsRes, itemRes, userRes, userExtRes, grantRes, cntRes] =
    await Promise.all([
      db
        .from('bean_campaign')
        .select('*')
        .eq('campaign_cd', CAMPAIGN_CD)
        .maybeSingle(),
      // 본인 매장 목록 (대표 매장 선택용)
      db
        .from('mps_shop')
        .select('shop_id, shop_nm')
        .eq('seller_id', user.id)
        .eq('del_yn', 'N')
        .order('reg_dtm', { ascending: true }),
      // 상품 등록: seller 계정 단위
      db
        .from('mps_item')
        .select('item_id', { count: 'exact', head: true })
        .eq('seller_id', user.id)
        .eq('del_yn', 'N'),
      // M3 텔레그램 연동 (기존 컬럼 — 항상 존재)
      db
        .from('sys_user')
        .select('tlgm_conn_yn')
        .eq('id', user.id)
        .maybeSingle(),
      // M4 알림확인 (SQL 100 신규 컬럼 — 미적용 시 에러 무시)
      db
        .from('sys_user')
        .select('tlgm_alrt_cfm_yn')
        .eq('id', user.id)
        .maybeSingle(),
      // 본인 신청 기록 (1인 1회 — shop_id 포함)
      db
        .from('bean_campaign_grant')
        .select('grant_st_cd, shop_id')
        .eq('campaign_cd', CAMPAIGN_CD)
        .eq('usr_id', user.id)
        .eq('del_yn', 'N')
        .maybeSingle(),
      // 선착순: 승인 수 기준
      db
        .from('bean_campaign_grant')
        .select('grant_id', { count: 'exact', head: true })
        .eq('campaign_cd', CAMPAIGN_CD)
        .eq('grant_st_cd', 'APPROVED')
        .eq('del_yn', 'N'),
    ])

  const camp = campRes.data as {
    campaign_nm: string
    reward_bean: number
    max_grant_cnt: number
    require_shop_yn: string
    require_item_yn: string
    require_telegram_yn: string
    require_tlgm_alrt_yn: string
    require_mission_cnt: number
    active_yn: string
  } | null
  if (!camp) return apiError('CAMP_NOT_FOUND', 404)

  const hasItem = (itemRes.count ?? 0) > 0
  const hasTelegram =
    (userRes.data as { tlgm_conn_yn?: string } | null)?.tlgm_conn_yn === 'Y'
  // SQL 100 미적용 시 userExtRes.error → tlgm_alrt_cfm_yn null → false 안전 폴백
  const hasTlgmAlrt =
    !userExtRes.error &&
    (userExtRes.data as { tlgm_alrt_cfm_yn?: string } | null)
      ?.tlgm_alrt_cfm_yn === 'Y'
  const grant = grantRes.data as {
    grant_st_cd: string
    shop_id: string | null
  } | null
  const approvedCnt = cntRes.count ?? 0

  const conditions = {
    shop: camp.require_shop_yn !== 'Y' || (shopsRes.data ?? []).length > 0,
    item: camp.require_item_yn !== 'Y' || hasItem,
    telegram: camp.require_telegram_yn !== 'Y' || hasTelegram,
    tlgm_alrt: camp.require_tlgm_alrt_yn !== 'Y' || hasTlgmAlrt,
    mission: camp.require_mission_cnt <= 0,
  }

  return NextResponse.json({
    campaign_nm: camp.campaign_nm,
    reward_bean: camp.reward_bean,
    require_mission_cnt: camp.require_mission_cnt,
    active: camp.active_yn === 'Y',
    conditions,
    eligible: Object.values(conditions).every(Boolean),
    // 본인 매장 목록 (대표 매장 선택 드롭다운용)
    my_shops: (shopsRes.data ?? []).map((s) => ({
      shop_id: s.shop_id,
      shop_nm: s.shop_nm,
    })),
    // 신청 기록 (1인 1회)
    grant_status: grant?.grant_st_cd ?? null,
    claimed_shop_id: grant?.shop_id ?? null,
    granted_cnt: approvedCnt,
    max_cnt: camp.max_grant_cnt,
    sold_out: approvedCnt >= camp.max_grant_cnt,
  })
}
