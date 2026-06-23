import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

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
  if (error) console.error('[campaign-grant-all] logBatchRun 실패:', error)
}

// GET /api/cron/campaign-grant-all  (1시간 주기)
// 매장 선착순 온보딩 이벤트 #2 — 조건 완수 판매자에게 자동 신청·승인·지급.
// 관리자 "🎁 완수자 일괄 지급" 버튼(/api/admin/campaign/grant-all)과 동일 효과.
//
// 자격 판정은 fn_bean_campaign_grant RPC에 완전 위임:
//   - SQL 100 적용 전: M1~M3 검사 (req_tlgm_alrt_yn='N')
//   - SQL 100 적용 후: M1~M4 검사 자동 적용 — 코드 수정 없음
// 멱등: ALREADY_SUBMITTED·NOT_PENDING은 이중지급 차단 결과, 재실행 안전.
// NOT_ELIGIBLE은 자격 미충족 정상 흐름 — 오류 아님.

const CAMPAIGN_CD = 'SHOP_ONBOARD'

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const start = new Date()
  const db = getSupabaseAdmin()

  // 매장 보유 판매자 목록 (중복 제거)
  const { data: shops, error: shopErr } = await db
    .from('mps_shop')
    .select('seller_id')
    .eq('del_yn', 'N')
  if (shopErr) {
    console.error('[cron/campaign-grant-all] 매장 조회 실패:', shopErr)
    return NextResponse.json({ ok: false, error: shopErr.message }, { status: 500 })
  }
  const sellerIds = [...new Set((shops ?? []).map(s => s.seller_id))]
  if (!sellerIds.length) {
    await logBatchRun('CRON', start, 0, 0, 0, 0, 'SYSTEM')
    return NextResponse.json({ ok: true, campaign: CAMPAIGN_CD, eligible: 0, granted: 0, already: 0, failed: 0 })
  }

  let granted = 0
  let already = 0
  let notEligible = 0
  let failed = 0
  const errors: string[] = []

  for (const uid of sellerIds) {
    try {
      // 1단계: 신청 — 자격검사(M1~M4) + PENDING 생성. 이미 신청/승인 시 무해하게 무시
      const { data: grantData } = await db.rpc('fn_bean_campaign_grant', {
        p_usr_id: uid,
        p_campaign_cd: CAMPAIGN_CD,
      })
      const grantStatus = (grantData as { status?: string } | null)?.status
      if (grantStatus === 'NOT_ELIGIBLE') {
        notEligible++
        continue // 자격 미충족 — 다음 판매자로
      }

      // 2단계: 승인·지급 (REWARD_POOL → USER). 이미 APPROVED면 NOT_PENDING
      const { data: approveData, error: approveErr } = await db.rpc('fn_bean_campaign_approve', {
        p_usr_id: uid,
        p_campaign_cd: CAMPAIGN_CD,
        p_admin_id: 'CRON',
      })
      if (approveErr) {
        failed++
        errors.push(`${uid}:${approveErr.message}`)
        continue
      }
      const approveStatus = (approveData as { status?: string } | null)?.status
      if (approveStatus === 'APPROVED') granted++
      else if (approveStatus === 'NOT_PENDING') already++ // 이미 승인됨 — 이중지급 차단
      else {
        // SOLD_OUT / INSUFFICIENT_POOL → 재원·한도 문제, 오류로 기록
        failed++
        errors.push(`${uid}:${approveStatus ?? 'UNKNOWN'}`)
      }
    } catch (e) {
      failed++
      errors.push(`${uid}:${(e as Error).message}`)
    }
  }

  await logBatchRun('CRON', start, sellerIds.length, granted, already, failed, 'SYSTEM')
  console.log(
    `[cron/campaign-grant-all] sellers=${sellerIds.length} granted=${granted} already=${already} notEligible=${notEligible} failed=${failed}`,
  )
  return NextResponse.json({
    ok: true,
    campaign: CAMPAIGN_CD,
    sellers: sellerIds.length,
    granted,
    already,
    notEligible,
    failed,
    ...(errors.length ? { errors } : {}),
  })
}
