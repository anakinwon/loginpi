// 관리자 사이트 신청 관리 API — PATCH /api/admin/sites/<id> (심사·승인 없음, PRD_USAGE_FEE_STATE §3)
//  start   : PAID → IN_USE 즉시 사용 시작 — RPC fn_bgn_site_use(sql/012, 사용기간 계산 단일 장소, modr_id=관리자). 대상 아님 NULL → 409
//  reject  : APPLYING → REJECTED (rjct_rsn_cd 필수). 진행 중 Pi 결제(원장 APPROVED)가 있으면 409 PAY_IN_PROGRESS — PAID 반려는 환불 수단 전까지 없음(D3)
//  suspend : IN_USE → SUSPENDED (관리자 직권) / restore : SUSPENDED → IN_USE (use_end_dtm 경과면 USED)
//  edit    : 콘텐츠(이름·구분·소개·로고·공개 연락처·이동 URL) 수정 — 상태 무관, 상태·도메인·요금제 불변(마스터 지시 2026-10-13 관리자 로고 등록)
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { hasOtherApprovedPayment } from '@/lib/payments'
import {
  apiError,
  db,
  dbFail,
  dbRoute,
  isOwnImgUrl,
  parseBody,
  requireAdmin,
  uuidParam,
} from '@/lib/api'
import {
  adminSiteActionSchema,
  OWNER_SITE_COLS,
  pickOwnerSite,
  type SiteSts,
} from '@/lib/site'

const FROM: Record<string, SiteSts> = {
  start: 'PAID',
  reject: 'APPLYING',
  suspend: 'IN_USE',
  restore: 'SUSPENDED',
}

export const PATCH = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const id = await uuidParam(ctx)
    if (!id) return apiError('INVALID_INPUT', 400)
    const admin = await requireAdmin(req)
    if (admin instanceof NextResponse) return admin
    const body = await parseBody(req, adminSiteActionSchema)
    if (body instanceof NextResponse) return body

    const { data: cur, error: curErr } = await db()
      .from('site_mst')
      .select('site_id, site_sts_cd, use_end_dtm, site_img_url')
      .eq('site_id', id)
      .eq('del_yn', 'N')
      .maybeSingle<{
        site_id: string
        site_sts_cd: SiteSts
        use_end_dtm: string | null
        site_img_url: string | null
      }>()
    if (curErr) return dbFail(curErr)
    if (!cur) return apiError('NOT_FOUND', 404)

    // 콘텐츠 수정 — 상태 무관(관리자 직권), 상태·도메인·요금제는 건드리지 않는다. 새 로고 URL 은 관리자 본인 업로드 폴더만(소유자 PATCH 와 같은 isOwnImgUrl 규칙)
    if (body.action === 'edit') {
      if (
        body.imgUrl &&
        body.imgUrl !== cur.site_img_url &&
        !isOwnImgUrl(body.imgUrl, admin.id)
      )
        return apiError('IMG_URL_INVALID', 400)
      const { data, error } = await db()
        .from('site_mst')
        .update({
          site_nm: body.name,
          site_ctgr_cd: body.ctgr,
          site_desc: body.desc ?? null,
          site_img_url: body.imgUrl ?? null,
          pub_cntc_txt: body.pubCntc ?? null,
          site_mv_url: body.mvUrl ?? null,
          spk_yn: body.spk ? 'Y' : 'N', // 자사 사이트는 결제 없이 켜짐(isSparkleOn)
          modr_id: admin.id,
        })
        .eq('site_id', cur.site_id)
        .select(OWNER_SITE_COLS)
        .maybeSingle()
      if (error) return dbFail(error)
      if (!data) return apiError('NOT_FOUND', 404)
      return NextResponse.json({ site: data })
    }

    if (cur.site_sts_cd !== FROM[body.action])
      return apiError('INVALID_STATE', 409)

    if (body.action === 'start') {
      const { data, error } = await db().rpc('fn_bgn_site_use', {
        p_site_id: cur.site_id,
        p_actor: admin.id,
      })
      if (error) {
        // P0004 요금제 사용기간 없음(fee_plan 결측) — 운영자가 요금표를 고친 뒤 재시도
        console.error(
          '[admin/sites] fn_bgn_site_use',
          error.code,
          error.message,
        )
        return error.code === 'P0004'
          ? apiError('PLAN_TERM_MISSING', 409)
          : dbFail(error)
      }
      const site = data as Record<string, unknown> | null
      if (!site?.site_id) return apiError('INVALID_STATE', 409)
      return NextResponse.json({ site: pickOwnerSite(site) })
    }

    if (
      // 반려·정지는 진행 중 결제(사용료·반짝임 단독, APPROVED) 가 있으면 막는다 — complete 가 상태 불일치로 실패하면 돈만 받는 좀비
      (body.action === 'reject' || body.action === 'suspend') &&
      (await hasOtherApprovedPayment(cur.site_id, ''))
    )
      return apiError('PAY_IN_PROGRESS', 409)

    const expired = !!cur.use_end_dtm && new Date(cur.use_end_dtm) <= new Date()
    const patch: Record<string, unknown> =
      body.action === 'reject'
        ? {
            site_sts_cd: 'REJECTED',
            rjct_rsn_cd: body.rsnCd,
            rjct_rsn_cont: body.rsnCont ?? null,
          }
        : body.action === 'suspend'
          ? { site_sts_cd: 'SUSPENDED', rjct_rsn_cont: body.rsnCont ?? null }
          : { site_sts_cd: expired ? 'USED' : 'IN_USE', rjct_rsn_cont: null }

    const { data, error } = await db()
      .from('site_mst')
      .update({ ...patch, modr_id: admin.id })
      .eq('site_id', cur.site_id)
      .eq('site_sts_cd', cur.site_sts_cd)
      .select(OWNER_SITE_COLS)
      .maybeSingle()
    if (error) {
      // 같은 도메인이 재등록된 상태에서 복구 시 활성 도메인 UNIQUE 충돌
      if (error.code === '23505') return apiError('DUPLICATE_DOMAIN', 409)
      return dbFail(error)
    }
    if (!data) return apiError('INVALID_STATE', 409)
    return NextResponse.json({ site: data })
  }),
)
