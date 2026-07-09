import { NextRequest, NextResponse, after } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getActiveFeeMode, beanToPi } from '@/lib/fee-resolver'
import { payCampaignPiReward } from '@/lib/campaign-pi-reward'
import { apiError } from '@/lib/api-errors'

// campaign_cd 형식: 대문자/숫자/언더스코어 (예: SHOP_ONBOARD, EVENT_M1)
const CD_RE = /^[A-Z][A-Z0-9_]{1,31}$/

type GrantRow = { campaign_cd: string; grant_st_cd: string }
type CampaignRow = {
  campaign_cd: string
  campaign_nm: string
  reward_bean: number
  max_grant_cnt: number
  src_wallet: string
  require_shop_yn: string
  require_item_yn: string
  require_telegram_yn: string
  require_mission_cnt: number
  active_yn: string
  start_dtm: string
  end_dtm: string | null
  reg_dtm: string
}

// GET /api/admin/campaign           → 전체 캠페인 목록 + 통계 + REWARD_POOL 잔액
// GET /api/admin/campaign?campaign_cd=X → 해당 캠페인 PENDING 신청 목록 + 현황
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user)) return apiError('FORBIDDEN', 401)

  const db = getSupabaseAdmin()
  const campaignCd = req.nextUrl.searchParams.get('campaign_cd')

  // ── 단일 캠페인: PENDING 신청 목록 (기존 승인 화면 호환) ──
  if (campaignCd) {
    const [pendingRes, campRes, approvedRes] = await Promise.all([
      db
        .from('bean_campaign_grant')
        .select('grant_id, usr_id, bean_amt, reg_dtm, shop_id')
        .eq('campaign_cd', campaignCd)
        .eq('grant_st_cd', 'PENDING')
        .eq('del_yn', 'N')
        .order('reg_dtm', { ascending: true }),
      db
        .from('bean_campaign')
        .select('campaign_nm, reward_bean, max_grant_cnt')
        .eq('campaign_cd', campaignCd)
        .maybeSingle(),
      db
        .from('bean_campaign_grant')
        .select('grant_id', { count: 'exact', head: true })
        .eq('campaign_cd', campaignCd)
        .eq('grant_st_cd', 'APPROVED')
        .eq('del_yn', 'N'),
    ])

    const rows = pendingRes.data ?? []
    // 사용자·매장 정보 병합 (FK 없음 → 별도 조회)
    const userIds = [...new Set(rows.map((r) => r.usr_id))]
    const shopIds = [
      ...new Set(
        rows.map((r) => (r as { shop_id?: string }).shop_id).filter(Boolean),
      ),
    ] as string[]

    const userMap = new Map<string, Record<string, unknown>>()
    const shopMap = new Map<string, string>()

    await Promise.all([
      userIds.length > 0
        ? db
            .from('sys_user')
            .select('id, pi_username, nick_nm, real_nm, display_name')
            .in('id', userIds)
            .then(({ data }) => {
              for (const u of data ?? [])
                userMap.set(
                  (u as { id: string }).id,
                  u as Record<string, unknown>,
                )
            })
        : Promise.resolve(),
      shopIds.length > 0
        ? db
            .from('mps_shop')
            .select('shop_id, shop_nm')
            .in('shop_id', shopIds)
            .then(({ data }) => {
              for (const s of data ?? [])
                shopMap.set(
                  (s as { shop_id: string }).shop_id,
                  (s as { shop_nm: string }).shop_nm,
                )
            })
        : Promise.resolve(),
    ])

    const camp = campRes.data as {
      campaign_nm: string
      reward_bean: number
      max_grant_cnt: number
    } | null
    return NextResponse.json({
      campaign_cd: campaignCd,
      campaign_nm: camp?.campaign_nm ?? campaignCd,
      pending: rows.map((r) => {
        const shopId = (r as { shop_id?: string }).shop_id
        return {
          ...r,
          sys_user: userMap.get(r.usr_id) ?? null,
          shop_nm: shopId ? (shopMap.get(shopId) ?? null) : null,
        }
      }),
      approved_cnt: approvedRes.count ?? 0,
      max_cnt: camp?.max_grant_cnt ?? 0,
      reward_bean: camp?.reward_bean ?? 0,
    })
  }

  // ── 전체 캠페인 목록 + 통계 + 재원 잔액 ──
  const [campsRes, grantsRes, poolRes] = await Promise.all([
    db
      .from('bean_campaign')
      .select(
        'campaign_cd, campaign_nm, reward_bean, max_grant_cnt, src_wallet, ' +
          'require_shop_yn, require_item_yn, require_telegram_yn, require_mission_cnt, ' +
          'active_yn, start_dtm, end_dtm, reg_dtm',
      )
      .eq('del_yn', 'N')
      .order('reg_dtm', { ascending: false }),
    // 상태별 카운트 집계용 (캠페인 수가 적어 전체 로드 후 JS 집계 — 라운드트립 1회)
    db
      .from('bean_campaign_grant')
      .select('campaign_cd, grant_st_cd')
      .eq('del_yn', 'N'),
    db
      .from('bean_token_wallet')
      .select('bean_amt')
      .eq('wallet_type', 'REWARD_POOL')
      .eq('del_yn', 'N')
      .maybeSingle(),
  ])

  // campaign_cd별 상태 카운트
  const stat = new Map<
    string,
    { pending: number; approved: number; rejected: number }
  >()
  for (const g of (grantsRes.data ?? []) as unknown as GrantRow[]) {
    const s = stat.get(g.campaign_cd) ?? {
      pending: 0,
      approved: 0,
      rejected: 0,
    }
    if (g.grant_st_cd === 'PENDING') s.pending++
    else if (g.grant_st_cd === 'APPROVED') s.approved++
    else if (g.grant_st_cd === 'REJECTED') s.rejected++
    stat.set(g.campaign_cd, s)
  }

  const campaigns = ((campsRes.data ?? []) as unknown as CampaignRow[]).map(
    (c) => {
      const s = stat.get(c.campaign_cd) ?? {
        pending: 0,
        approved: 0,
        rejected: 0,
      }
      return { ...c, ...s }
    },
  )

  const pool = poolRes.data as { bean_amt: number } | null
  return NextResponse.json({
    campaigns,
    reward_pool_balance: pool?.bean_amt ?? 0,
  })
}

// POST /api/admin/campaign
//   { action: 'approve' | 'reject', usr_id, campaign_cd }   — 신청 승인/거절 (기존)
//   { action: 'create', campaign: {...} }                   — 새 캠페인 생성
//   { action: 'update', campaign_cd, patch: {...} }         — 보상·한도·활성 수정
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user)) return apiError('FORBIDDEN', 401)

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const action = body.action as string | undefined
  const db = getSupabaseAdmin()

  // ── 승인 / 거절 (검증된 RPC 재사용 — 지급 경로 무변경) ──
  if (action === 'approve' || action === 'reject') {
    const usrId = body.usr_id as string | undefined
    const campaignCd =
      (body.campaign_cd as string | undefined) ?? 'SHOP_ONBOARD'
    if (!usrId) return apiError('ADM_CAMP_USR_ID_REQUIRED', 400)

    // 승인은 요금모드 전달 (PRD_24 §0) — PI모드면 RPC가 Bean 지급 생략·승인 전이만
    const mode = action === 'approve' ? await getActiveFeeMode() : null
    const fn =
      action === 'approve'
        ? 'fn_bean_campaign_approve'
        : 'fn_bean_campaign_reject'
    const { data, error } = await db.rpc(fn, {
      p_usr_id: usrId,
      p_campaign_cd: campaignCd,
      p_admin_id: user!.id,
      ...(mode ? { p_mode: mode } : {}),
    })
    if (error) {
      console.error(`[admin/campaign] ${action} 실패:`, error.message)
      return apiError('ADM_PROCESS_FAILED', 500)
    }

    // PI모드 승인 = 관리자 게이트 통과 → 실 Pi A2U 송금(비블로킹, 멱등 로그).
    // 실패 시 fbck-pi-payout cron이 승인 완료분(PENDING/FAILED)을 재시도.
    const res = data as { status?: string; reward?: number } | null
    if (mode === 'PI' && res?.status === 'APPROVED') {
      const piAmt = beanToPi(Number(res.reward ?? 0))
      after(() => payCampaignPiReward(campaignCd, usrId, piAmt))
    }
    return NextResponse.json(data)
  }

  // ── 새 캠페인 생성 ──
  if (action === 'create') {
    const c = (body.campaign ?? {}) as Record<string, unknown>
    const cd = String(c.campaign_cd ?? '').trim()
    const nm = String(c.campaign_nm ?? '').trim()
    const rewardBean = Math.floor(Number(c.reward_bean))
    const maxCnt = Math.floor(Number(c.max_grant_cnt))

    if (!CD_RE.test(cd)) return apiError('ADM_CAMP_CD_FORMAT', 400)
    if (!nm) return apiError('ADM_CAMP_NAME_REQUIRED', 400)
    if (!Number.isInteger(rewardBean) || rewardBean <= 0)
      return apiError('ADM_CAMP_REWARD_BEAN_POSITIVE', 400)
    if (!Number.isInteger(maxCnt) || maxCnt <= 0)
      return apiError('ADM_CAMP_MAX_CNT_POSITIVE', 400)

    // 중복 코드 차단 (논리삭제 행 포함 — PK 충돌 방지)
    const { data: dup } = await db
      .from('bean_campaign')
      .select('campaign_cd')
      .eq('campaign_cd', cd)
      .maybeSingle()
    if (dup) return apiError('ADM_CAMP_CD_DUP', 409, { cd })

    const yn = (v: unknown) => (v === true || v === 'Y' ? 'Y' : 'N')
    const { error } = await db.from('bean_campaign').insert({
      campaign_cd: cd,
      campaign_nm: nm,
      reward_bean: rewardBean,
      max_grant_cnt: maxCnt,
      src_wallet: 'REWARD_POOL',
      require_shop_yn: yn(c.require_shop_yn),
      require_item_yn: yn(c.require_item_yn),
      require_telegram_yn: yn(c.require_telegram_yn),
      require_mission_cnt: Math.max(
        0,
        Math.floor(Number(c.require_mission_cnt)) || 0,
      ),
      active_yn: yn(c.active_yn ?? 'Y'),
      regr_id: user!.id,
      modr_id: user!.id,
    })
    if (error) {
      console.error('[admin/campaign] create 실패:', error.message)
      return apiError('ADM_CAMP_CREATE_FAILED', 500)
    }
    return NextResponse.json({ status: 'CREATED', campaign_cd: cd })
  }

  // ── 캠페인 수정 (보상·한도·활성 토글) ──
  if (action === 'update') {
    const cd = String(body.campaign_cd ?? '').trim()
    const patch = (body.patch ?? {}) as Record<string, unknown>
    if (!cd) return apiError('ADM_CAMP_CD_REQUIRED', 400)

    const upd: Record<string, unknown> = {
      modr_id: user!.id,
      mod_dtm: new Date().toISOString(),
    }
    if (patch.active_yn !== undefined)
      upd.active_yn =
        patch.active_yn === true || patch.active_yn === 'Y' ? 'Y' : 'N'
    if (patch.reward_bean !== undefined) {
      const v = Math.floor(Number(patch.reward_bean))
      if (!Number.isInteger(v) || v <= 0)
        return apiError('ADM_CAMP_REWARD_BEAN_MIN', 400)
      upd.reward_bean = v
    }
    if (patch.max_grant_cnt !== undefined) {
      const v = Math.floor(Number(patch.max_grant_cnt))
      if (!Number.isInteger(v) || v <= 0)
        return apiError('ADM_CAMP_MAX_CNT_MIN', 400)
      upd.max_grant_cnt = v
    }
    if (patch.campaign_nm !== undefined) {
      const nm = String(patch.campaign_nm).trim()
      if (nm) upd.campaign_nm = nm
    }

    const { error } = await db
      .from('bean_campaign')
      .update(upd)
      .eq('campaign_cd', cd)
      .eq('del_yn', 'N')
    if (error) {
      console.error('[admin/campaign] update 실패:', error.message)
      return apiError('ADM_CAMP_UPDATE_FAILED', 500)
    }
    return NextResponse.json({ status: 'UPDATED', campaign_cd: cd })
  }

  return apiError('ADM_CAMP_ACTION_INVALID', 400)
}
