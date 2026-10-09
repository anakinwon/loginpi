// 내 사이트 수정·제출·철회 API — PATCH /api/me/sites/<id> (로그인 + 소유자 본인)
//  { action:'withdraw' } → WITHDRAWN (WITHDRAWN·SUSPENDED 제외 — 정지 사이트 철회로 제재 이력 회피·도메인 재등록 방지)
//  등록 본문(siteInputSchema) → 저장. submit=true 면 PENDING 제출, APPROVED 사이트 내용 변경은 재심사(PENDING)
//  도메인 변경은 DRAFT·REJECTED(미노출)만, SUSPENDED·WITHDRAWN 은 수정 불가. OWNERSHIP 반려 행은 도메인 변경 불가(반려 이력 세탁 방지 → 409)
//  PENDING 진입(제출·재심사) 시 같은 도메인 PENDING 이상 다른 행 → 409, DRAFT+PENDING 이 늘면 사용자당 5건 상한(409)
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
import {
  OPEN_STS,
  OWNER_SITE_COLS,
  siteActionSchema,
  siteInputSchema,
  type SiteSts,
} from '@/lib/site'

const EDITABLE: SiteSts[] = ['DRAFT', 'PENDING', 'REJECTED', 'APPROVED']
const DOMAIN_EDITABLE: SiteSts[] = ['DRAFT', 'REJECTED']

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
      .select('site_id, site_dom_nm, site_sts_cd, rjct_rsn_cd')
      .eq('site_id', id)
      .eq('ownr_usr_id', user.id)
      .eq('del_yn', 'N')
      .maybeSingle<{
        site_id: string
        site_dom_nm: string
        site_sts_cd: SiteSts
        rjct_rsn_cd: string | null
      }>()
    if (curErr) return dbFail(curErr)
    if (!cur) return apiError('NOT_FOUND', 404)

    let patch: Record<string, unknown>
    if (siteActionSchema.safeParse(raw).success) {
      if (cur.site_sts_cd === 'WITHDRAWN' || cur.site_sts_cd === 'SUSPENDED')
        return apiError('INVALID_STATE', 409)
      patch = { site_sts_cd: 'WITHDRAWN' }
    } else {
      const parsed = siteInputSchema.safeParse(raw)
      if (!parsed.success) return apiError('INVALID_INPUT', 400)
      const body = parsed.data
      if (!EDITABLE.includes(cur.site_sts_cd))
        return apiError('INVALID_STATE', 409)
      if (
        body.domain !== cur.site_dom_nm &&
        !DOMAIN_EDITABLE.includes(cur.site_sts_cd)
      )
        return apiError('INVALID_STATE', 409)
      if (body.domain !== cur.site_dom_nm && cur.rjct_rsn_cd === 'OWNERSHIP')
        return apiError('DOMAIN_REJECTED_OWNERSHIP', 409)
      if (body.imgUrl && !isOwnImgUrl(body.imgUrl, user.id))
        return apiError('IMG_URL_INVALID', 400)
      // 제출 또는 노출 중 내용 변경 → 재심사. 그 외(DRAFT·PENDING·REJECTED 저장)는 상태 유지
      const nextSts: SiteSts =
        body.submit || cur.site_sts_cd === 'APPROVED'
          ? 'PENDING'
          : cur.site_sts_cd
      const denied = await checkSiteWrite(user.id, body.domain, {
        addsOpen:
          OPEN_STS.includes(nextSts) && !OPEN_STS.includes(cur.site_sts_cd),
        submit: nextSts === 'PENDING' && cur.site_sts_cd !== 'PENDING',
        exceptId: cur.site_id,
      })
      if (denied) return denied
      patch = {
        site_dom_nm: body.domain,
        site_nm: body.name,
        site_ctgr_cd: body.ctgr,
        site_desc: body.desc ?? null,
        site_img_url: body.imgUrl ?? null,
        pvt_cntc_txt: body.pvtCntc ?? null,
        pub_cntc_txt: body.pubCntc ?? null,
        site_sts_cd: nextSts,
        ...(nextSts === 'REJECTED'
          ? {}
          : { rjct_rsn_cd: null, rjct_rsn_cont: null }),
      }
    }

    // 낙관적 동시성 — 읽은 상태 그대로일 때만 갱신(관리자 심사와 경합 시 409)
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
