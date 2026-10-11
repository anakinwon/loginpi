// 내 사이트 API — GET(내 등록 목록, 전 상태·페이지네이션 + 도메인 소유 확인 토큰) / POST(등록 : submit=true → PENDING 제출, false → DRAFT 저장). 로그인 필수
// 등록 규칙 : DRAFT+PENDING 합계 사용자당 5건(409 SITE_LIMIT), 제출 시 같은 도메인 PENDING 이상 존재 → 409 DUPLICATE_DOMAIN
import { NextResponse } from 'next/server'
import { withAuthGuard, withGuard } from '@pi/guard'
import {
  apiError,
  checkSiteWrite,
  db,
  dbFail,
  dbRoute,
  isOwnImgUrl,
  pageParam,
  parseBody,
  requireUser,
  verifyToken,
} from '@/lib/api'
import { LIMITS, OWNER_SITE_COLS, siteInputSchema } from '@/lib/site'

export const dynamic = 'force-dynamic'

export const GET = withGuard(
  dbRoute(async (req) => {
    const user = await requireUser(req)
    if (user instanceof NextResponse) return user
    const page = pageParam(req)
    const size = LIMITS.adminPageSize
    const { data, error, count } = await db()
      .from('site_mst')
      .select(OWNER_SITE_COLS, { count: 'exact' })
      .eq('ownr_usr_id', user.id)
      .eq('del_yn', 'N')
      .order('reg_dtm', { ascending: false })
      .range((page - 1) * size, page * size - 1)
    if (error) return dbFail(error)
    return NextResponse.json({
      items: (data ?? []).map((s) => ({
        ...s,
        vrfy_tkn: verifyToken(s.site_id, s.site_dom_nm),
      })),
      total: count ?? 0,
      page,
      pageSize: size,
    })
  }),
)

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    const user = await requireUser(req)
    if (user instanceof NextResponse) return user
    const body = await parseBody(req, siteInputSchema)
    if (body instanceof NextResponse) return body
    if (body.imgUrl && !isOwnImgUrl(body.imgUrl, user.id))
      return apiError('IMG_URL_INVALID', 400)
    const denied = await checkSiteWrite(user.id, body.domain, {
      addsOpen: true,
      submit: body.submit,
    })
    if (denied) return denied

    const { data, error } = await db()
      .from('site_mst')
      .insert({
        site_dom_nm: body.domain,
        site_nm: body.name,
        site_ctgr_cd: body.ctgr,
        site_desc: body.desc ?? null,
        site_img_url: body.imgUrl ?? null,
        site_mv_url: body.mvUrl ?? null,
        pvt_cntc_txt: body.pvtCntc ?? null,
        pub_cntc_txt: body.pubCntc ?? null,
        site_sts_cd: body.submit ? 'PENDING' : 'DRAFT',
        ownr_usr_id: user.id,
        own_site_yn: 'N',
        regr_id: user.id,
        modr_id: user.id,
      })
      .select(OWNER_SITE_COLS)
      .single()
    if (error) {
      if (error.code === '23505') return apiError('DUPLICATE_DOMAIN', 409)
      if (error.code === '23514') return apiError('INVALID_INPUT', 400)
      return dbFail(error)
    }
    return NextResponse.json({ site: data }, { status: 201 })
  }),
  { maxBodySize: 16_384 },
)
