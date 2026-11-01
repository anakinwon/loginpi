// 이행 계획 목록·생성 — GET /api/migration/plans?link=&page= (연결별 최근 변경순 10건, x_dbm_mig_plan_01)
//  POST { link, prjId, prjNm?, planNm } : schema.pi /model 을 받아 설계 스냅샷(A4)으로 고정 → DRAFT 계획 1행. 실행 엔진 없음(D6)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, parseBody } from '@/lib/api'
import { linkErrorResponse, linkGet, requireLink } from '@/lib/link/client'
import { clampOpts, toSnapshot, type ModelRes } from '@/lib/migration/plan'

const PAGE_SIZE = 10

export const GET = withGuard(
  dbRoute(async (req) => {
    const sp = req.nextUrl.searchParams
    const linkId = sp.get('link') ?? ''
    if (!linkId) return apiError('INVALID_INPUT', 400)
    const page = Math.max(1, Math.min(1000, Number(sp.get('page')) || 1))
    const ctx = await requireLink(req, linkId)
    if (ctx instanceof Response) return ctx as NextResponse

    const from = (page - 1) * PAGE_SIZE
    // 목록은 스냅샷 본문(snap_json) 없이 — 건수는 화면 페이지 표시에 쓴다(R-P3)
    const { data, error, count } = await db()
      .from('dbm_mig_plan')
      .select('mig_plan_id, prj_id, prj_nm, plan_nm, sts_cd, mod_dtm', { count: 'exact' })
      .eq('lnk_id', ctx.linkId)
      .eq('del_yn', 'N')
      .order('mod_dtm', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (error) return dbFail(error)
    return NextResponse.json({ plans: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE })
  }),
)

const Body = z.object({
  link: z.string().uuid(),
  prjId: z.string().min(1).max(100),
  prjNm: z.string().max(200).optional(),
  planNm: z.string().trim().min(1).max(100),
})

export const POST = withGuard(
  dbRoute(async (req) => {
    const body = await parseBody(req, Body)
    if (body instanceof NextResponse) return body
    const ctx = await requireLink(req, body.link)
    if (ctx instanceof Response) return ctx as NextResponse

    let model: ModelRes
    try {
      model = await linkGet<ModelRes>(ctx.linkId, `/model?prjId=${encodeURIComponent(body.prjId)}`)
    } catch (e) {
      return linkErrorResponse(e)
    }
    const snap = toSnapshot(model)
    if (snap.tables.length === 0)
      return NextResponse.json({ error: '이행할 물리 테이블이 없습니다', code: 'MIG_NO_TABLES' }, { status: 422 })

    const opts = clampOpts({})
    // 연결 = 소유자 1명(D4) — 등록자는 연결ID로 추적(세션 재조회 없이, R-P2)
    const { data, error } = await db()
      .from('dbm_mig_plan')
      .insert({
        lnk_id: ctx.linkId,
        prj_id: body.prjId,
        prj_nm: body.prjNm ?? null,
        plan_nm: body.planNm,
        chnk_sz: opts.chunkSize,
        prll_cnt: opts.parallel,
        snap_json: snap,
        regr_id: ctx.usrId || 'ADMIN',
        modr_id: ctx.usrId || 'ADMIN',
      })
      .select('mig_plan_id')
      .maybeSingle()
    if (error) return dbFail(error)
    if (!data) return apiError('INTERNAL', 500)
    return NextResponse.json({ planId: data.mig_plan_id })
  }),
)
