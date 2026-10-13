// 내 사이트 단건 조회·수정·신청·철회 API — GET/PATCH /api/me/sites/<id> (로그인 + 소유자 본인)
//  GET : 결제 페이지(/pay/<id>)용 소유자 뷰(OWNER_SITE_COLS)
//  { action:'withdraw' } → WITHDRAWN (PAID·SUSPENDED·WITHDRAWN 제외, 진행 중 Pi 결제 있으면 409 PAY_IN_PROGRESS)
//  등록 본문(siteInputSchema) → 저장. submit=true 이고 현재 상태가 APPLY_FROM_STS(DRAFT·REJECTED·USED·EXPIRED)면 APPLYING 신청(aply_dtm=now, rjct_* 초기화,
//   USED·EXPIRED 재등록은 결제·사용기간 컬럼 초기화). pymnt_id 가 남은 REJECTED(환불 전)는 재신청 409 PAY_PENDING_REFUND
//  APPLYING 수정은 aply_dtm 유지(타이머 리셋 금지), IN_USE 수정은 상태 유지(재심사 없음)하되 도메인·요금제·이동 URL 잠금
//  도메인 변경은 DOMAIN_EDITABLE_STS 만, OWNERSHIP 반려 행은 도메인 변경 불가(반려 이력 세탁 방지 → 409). EXPIRED 는 재신청만
//  APPLYING 진입 시 같은 도메인 점유 다른 행 → 409, DRAFT+APPLYING 이 늘면 사용자당 5건 상한(409)
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import {
  apiError,
  checkSiteWrite,
  db,
  dbFail,
  dbRoute,
  isOwnImgUrl,
  requireUser,
  uuidParam,
} from '@/lib/api'
import { hasOtherApprovedPayment } from '@/lib/payments'
import {
  APPLY_FROM_STS,
  BLOCK_REAPPLY_RSN,
  DOMAIN_EDITABLE_STS,
  EDITABLE_STS,
  OPEN_STS,
  OWNER_SITE_COLS,
  siteActionSchema,
  siteInputSchema,
  WITHDRAW_BLOCKED_STS,
  type SiteSts,
} from '@/lib/site'

export const GET = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const id = await uuidParam(ctx)
    if (!id) return apiError('INVALID_INPUT', 400)
    const user = await requireUser(req)
    if (user instanceof NextResponse) return user
    const { data, error } = await db()
      .from('site_mst')
      .select(OWNER_SITE_COLS)
      .eq('site_id', id)
      .eq('ownr_usr_id', user.id)
      .eq('del_yn', 'N')
      .maybeSingle()
    if (error) return dbFail(error)
    if (!data) return apiError('NOT_FOUND', 404)
    return NextResponse.json({ site: data })
  }),
)

export const PATCH = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const id = await uuidParam(ctx)
    if (!id) return apiError('INVALID_INPUT', 400)
    const user = await requireUser(req)
    if (user instanceof NextResponse) return user

    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return apiError('BAD_REQUEST_BODY', 400)
    }

    const { data: cur, error: curErr } = await db()
      .from('site_mst')
      .select(
        'site_id, site_dom_nm, site_sts_cd, rjct_rsn_cd, plan_cd, pymnt_id, site_mv_url, spk_yn, spk_pymnt_id',
      )
      .eq('site_id', id)
      .eq('ownr_usr_id', user.id)
      .eq('del_yn', 'N')
      .maybeSingle<{
        site_id: string
        site_dom_nm: string
        site_sts_cd: SiteSts
        rjct_rsn_cd: string | null
        plan_cd: string
        pymnt_id: string | null
        site_mv_url: string | null
        spk_yn: 'Y' | 'N'
        spk_pymnt_id: string | null
      }>()
    if (curErr) return dbFail(curErr)
    if (!cur) return apiError('NOT_FOUND', 404)

    let patch: Record<string, unknown>
    if (siteActionSchema.safeParse(raw).success) {
      if (WITHDRAW_BLOCKED_STS.includes(cur.site_sts_cd))
        return apiError('INVALID_STATE', 409)
      // 결제 진행 중(원장 APPROVED, complete 전) 철회 금지 — 철회 뒤 complete 되면 돈만 받고 사용 못 하는 상태
      if (await hasOtherApprovedPayment(cur.site_id, ''))
        return apiError('PAY_IN_PROGRESS', 409)
      patch = { site_sts_cd: 'WITHDRAWN' }
    } else {
      const parsed = siteInputSchema.safeParse(raw)
      if (!parsed.success) return apiError('INVALID_INPUT', 400)
      const body = parsed.data
      const reapply = body.submit && APPLY_FROM_STS.includes(cur.site_sts_cd)
      if (!reapply && !EDITABLE_STS.includes(cur.site_sts_cd))
        return apiError('INVALID_STATE', 409)
      if (
        body.domain !== cur.site_dom_nm &&
        !DOMAIN_EDITABLE_STS.includes(cur.site_sts_cd)
      )
        return apiError('INVALID_STATE', 409)
      // 차단 사유(OWNERSHIP·금지 7종)로 반려된 행은 도메인을 바꿔 우회하지 못한다
      if (
        body.domain !== cur.site_dom_nm &&
        cur.rjct_rsn_cd &&
        (BLOCK_REAPPLY_RSN as readonly string[]).includes(cur.rjct_rsn_cd)
      )
        return apiError(
          cur.rjct_rsn_cd === 'OWNERSHIP'
            ? 'DOMAIN_REJECTED_OWNERSHIP'
            : 'DOMAIN_REJECTED_POLICY',
          409,
        )
      if (body.imgUrl && !isOwnImgUrl(body.imgUrl, user.id))
        return apiError('IMG_URL_INVALID', 400)
      // 사용 중엔 이동 URL·요금제 잠금(피싱 교체 방지 — 다음 재등록 때만)
      if (
        cur.site_sts_cd === 'IN_USE' &&
        ((body.mvUrl ?? null) !== cur.site_mv_url ||
          body.planCd !== cur.plan_cd)
      )
        return apiError('INVALID_STATE', 409)
      // 결제된 반려 건(환불 전)은 재신청 불가 — 관리자 경유
      if (reapply && cur.site_sts_cd === 'REJECTED' && cur.pymnt_id)
        return apiError('PAY_PENDING_REFUND', 409)
      // 재등록(새 결제)은 신청(submit)일 때만 — USED 행을 저장만 하면 결제·요금제 잠금 유지
      const renew =
        reapply && (cur.site_sts_cd === 'USED' || cur.site_sts_cd === 'EXPIRED')
      // 결제 완료 후 요금제 변경 불가(결제 금액 = 요금제 단가) — 재등록은 새 결제이므로 허용
      if (cur.pymnt_id && !renew && body.planCd !== cur.plan_cd)
        return apiError('PAY_ALREADY_PAID', 409)
      const denied = await checkSiteWrite(user.id, body.domain, {
        addsOpen: reapply && !OPEN_STS.includes(cur.site_sts_cd),
        submit: reapply,
        exceptId: cur.site_id,
      })
      if (denied) return denied
      patch = {
        site_dom_nm: body.domain,
        site_nm: body.name,
        site_ctgr_cd: body.ctgr,
        site_desc: body.desc ?? null,
        site_img_url: body.imgUrl ?? null,
        site_mv_url: body.mvUrl ?? null,
        plan_cd: body.planCd,
        // 결제된 반짝임은 소유자가 바꾸지 못한다(현재값 유지 — 관리자 토글도 보존). 재등록은 새 결제라 선택값 그대로
        spk_yn: cur.spk_pymnt_id && !renew ? cur.spk_yn : body.spk ? 'Y' : 'N',
        pvt_cntc_txt: body.pvtCntc ?? null,
        pub_cntc_txt: body.pubCntc ?? null,
        ...(reapply && {
          site_sts_cd: 'APPLYING',
          aply_dtm: new Date().toISOString(),
          rjct_rsn_cd: null,
          rjct_rsn_cont: null,
        }),
        ...(reapply &&
          renew && {
            pymnt_id: null,
            pay_dtm: null,
            use_bgn_dtm: null,
            use_end_dtm: null,
            spk_pymnt_id: null,
            spk_pay_dtm: null,
          }),
      }
    }

    // 낙관적 동시성 — 읽은 상태 그대로일 때만 갱신(관리자·크론 전이와 경합 시 409)
    const { data, error } = await db()
      .from('site_mst')
      .update({ ...patch, modr_id: user.id })
      .eq('site_id', cur.site_id)
      .eq('site_sts_cd', cur.site_sts_cd)
      .select(OWNER_SITE_COLS)
      .maybeSingle()
    if (error) {
      if (error.code === '23505') return apiError('DUPLICATE_DOMAIN', 409)
      if (error.code === '23514') return apiError('INVALID_INPUT', 400)
      return dbFail(error)
    }
    if (!data) return apiError('INVALID_STATE', 409)
    return NextResponse.json({ site: data })
  }),
  { maxBodySize: 16_384 },
)
