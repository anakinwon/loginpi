import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const CAMPAIGN_CD = 'SHOP_ONBOARD'

async function logBatchRun(
  triggerCd: string,
  start: Date,
  sellers: number,
  granted: number,
  already: number,
  failed: number,
  regrId: string,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const { error } = await getSupabaseAdmin()
    .from('sys_batch_log')
    .insert({
      job_nm: 'campaign_grant_all',
      trigger_cd: triggerCd,
      from_dt: today,
      to_dt: today,
      start_dtm: start.toISOString(),
      end_dtm: new Date().toISOString(),
      success_yn: failed === 0 ? 'Y' : 'N',
      total_cnt: sellers,
      failed_cnt: failed,
      result_msg: `granted=${granted} already=${already} failed=${failed}`,
      regr_id: regrId,
      modr_id: regrId,
    })
  if (error)
    console.error('[admin/campaign/grant-all] logBatchRun 실패:', error)
}

// POST /api/admin/campaign/grant-all
// 매장 선착순 온보딩 이벤트(Event #2) — 3조건(매장·상품·텔레그램) 완수 판매자 전원에게
// 보상을 일괄 지급한다 (관리자 전용). Event #1 보상 버튼과 동일한 패턴.
//
// 멱등 (이중지급 절대 금지): grant(신청·자격검사·선착순 내장) + approve(승인·지급) 모두 멱등 RPC.
//   이미 승인된 매장은 PENDING이 없어 approve가 'NOT_PENDING' 반환 → already로 집계(재지급 안 됨).
//   재원/선착순 초과는 'INSUFFICIENT_POOL'/'SOLD_OUT'으로 errors에 남는다.
export async function POST() {
  const user = await getSessionUser()
  if (!isAdmin(user))
    return NextResponse.json(
      { error: '관리자 권한이 필요합니다' },
      { status: 403 },
    )

  const start = new Date()
  const db = getSupabaseAdmin()

  // 1) 매장 보유 판매자 목록
  const { data: shops, error: shopErr } = await db
    .from('mps_shop')
    .select('seller_id')
    .eq('del_yn', 'N')
  if (shopErr)
    return NextResponse.json({ error: shopErr.message }, { status: 500 })
  const sellerIds = [...new Set((shops ?? []).map((s) => s.seller_id))]
  if (!sellerIds.length)
    return NextResponse.json({
      ok: true,
      eligible: 0,
      granted: 0,
      already: 0,
      failed: 0,
    })

  // 2) 상품·텔레그램 조건 (FK 없음 → 별도 조회 후 Set 병합, campaign/shops와 동일 판정)
  const [usersRes, itemsRes] = await Promise.all([
    db.from('sys_user').select('id, tlgm_conn_yn').in('id', sellerIds),
    db
      .from('mps_item')
      .select('seller_id')
      .eq('del_yn', 'N')
      .in('seller_id', sellerIds),
  ])
  const tlgmSet = new Set(
    (usersRes.data ?? [])
      .filter((u) => (u as { tlgm_conn_yn?: string }).tlgm_conn_yn === 'Y')
      .map((u) => (u as { id: string }).id),
  )
  const itemSet = new Set(
    (itemsRes.data ?? []).map((i) => (i as { seller_id: string }).seller_id),
  )

  // 3) 3조건 완수자 = 매장(보유) + 상품 + 텔레그램
  const targets = sellerIds.filter((id) => itemSet.has(id) && tlgmSet.has(id))

  // 4) 각자 신청(grant) → 승인·지급(approve), 멱등 RPC에 위임
  let granted = 0
  let already = 0
  let failed = 0
  const errors: string[] = []
  for (const uid of targets) {
    try {
      // 신청: PENDING 생성(자격검사·선착순 내장). 이미 신청/승인 시 무시 → 다음 approve로 판정
      await db.rpc('fn_bean_campaign_grant', {
        p_usr_id: uid,
        p_campaign_cd: CAMPAIGN_CD,
      })
      // 승인 + 지급(REWARD_POOL → USER). 이미 APPROVED면 NOT_PENDING
      const { data, error } = await db.rpc('fn_bean_campaign_approve', {
        p_usr_id: uid,
        p_campaign_cd: CAMPAIGN_CD,
        p_admin_id: user!.id,
      })
      if (error) {
        failed++
        errors.push(`${uid}:${error.message}`)
        continue
      }
      const status = (data as { status?: string } | null)?.status
      if (status === 'APPROVED') granted++
      else if (status === 'NOT_PENDING')
        already++ // 이미 지급됨 — 이중지급 차단
      else {
        failed++
        errors.push(`${uid}:${status ?? 'UNKNOWN'}`) // SOLD_OUT / INSUFFICIENT_POOL 등
      }
    } catch (e) {
      failed++
      errors.push(`${uid}:${(e as Error).message}`)
    }
  }

  await logBatchRun(
    'MANUAL',
    start,
    targets.length,
    granted,
    already,
    failed,
    user!.id,
  )
  return NextResponse.json({
    ok: true,
    eligible: targets.length, // 3조건 완수자(지급 대상)
    granted, // 이번에 신규 지급
    already, // 이미 지급되어 건너뜀
    failed, // 실패(재원 부족·선착순 초과 등)
    ...(errors.length ? { errors } : {}),
  })
}
