// 이행 계획 1건 — GET ?link= (스냅샷·체크리스트·옵션) / PATCH { link, planNm?, chunkSize?, parallel?, chk?, stsCd?, del? }
//  READY 는 컷오버 체크리스트 전부 확인일 때만(서버도 막음, R-P5). 삭제 = 논리삭제(del_yn)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, parseBody } from '@/lib/api'
import { requireLink } from '@/lib/link/client'
import { CHECKLIST, clampOpts, LIMITS } from '@/lib/migration/plan'

type Ctx = { params: Promise<{ planId: string }> }
const UUID = z.string().uuid()
const COLS = 'mig_plan_id, prj_id, prj_nm, plan_nm, chnk_sz, prll_cnt, snap_json, chk_json, sts_cd, mod_dtm'

export const GET = withGuard(
  dbRoute(async (req, ctx) => {
    const { planId } = await (ctx as Ctx).params
    const linkId = req.nextUrl.searchParams.get('link') ?? ''
    if (!UUID.safeParse(planId).success || !linkId) return apiError('INVALID_INPUT', 400)
    const link = await requireLink(req, linkId)
    if (link instanceof Response) return link as NextResponse
    const { data, error } = await db()
      .from('dbm_mig_plan')
      .select(COLS)
      .eq('mig_plan_id', planId)
      .eq('lnk_id', link.linkId)
      .eq('del_yn', 'N')
      .maybeSingle()
    if (error) return dbFail(error)
    if (!data) return apiError('NOT_FOUND', 404)
    return NextResponse.json({ plan: data })
  }),
)

const Body = z.object({
  link: z.string().uuid(),
  planNm: z.string().trim().min(1).max(100).optional(),
  chunkSize: z.number().int().min(LIMITS.chunkMin).max(LIMITS.chunkMax).optional(),
  parallel: z.number().int().min(LIMITS.parallelMin).max(LIMITS.parallelMax).optional(),
  chk: z.partialRecord(z.enum(CHECKLIST), z.boolean()).optional(),
  stsCd: z.enum(['DRAFT', 'READY']).optional(),
  del: z.literal(true).optional(),
})

export const PATCH = withGuard(
  dbRoute(async (req, ctx) => {
    const { planId } = await (ctx as Ctx).params
    if (!UUID.safeParse(planId).success) return apiError('INVALID_INPUT', 400)
    const body = await parseBody(req, Body)
    if (body instanceof NextResponse) return body
    const link = await requireLink(req, body.link)
    if (link instanceof Response) return link as NextResponse

    // 체크리스트 병합·READY 판정에 현재 값이 필요(앞 결과를 쓰므로 직렬)
    const { data: cur, error: e1 } = await db()
      .from('dbm_mig_plan')
      .select('chnk_sz, prll_cnt, chk_json')
      .eq('mig_plan_id', planId)
      .eq('lnk_id', link.linkId)
      .eq('del_yn', 'N')
      .maybeSingle()
    if (e1) return dbFail(e1)
    if (!cur) return apiError('NOT_FOUND', 404)

    const chk = { ...((cur.chk_json ?? {}) as Record<string, boolean>), ...(body.chk ?? {}) }
    const allDone = CHECKLIST.every((k) => chk[k] === true)
    if (body.stsCd === 'READY' && !allDone)
      return NextResponse.json(
        { error: '컷오버 체크리스트를 모두 확인해야 합니다', code: 'MIG_CHECK_INCOMPLETE' },
        { status: 409 },
      )
    const opts = clampOpts({ chunkSize: body.chunkSize ?? cur.chnk_sz, parallel: body.parallel ?? cur.prll_cnt })
    const now = new Date().toISOString()
    // 체크를 하나라도 풀면 READY → DRAFT(준비 상태와 점검이 어긋나지 않게)
    const stsCd = body.stsCd ?? (allDone ? undefined : 'DRAFT')
    const patch: Record<string, unknown> = {
      chnk_sz: opts.chunkSize,
      prll_cnt: opts.parallel,
      chk_json: chk,
      modr_id: link.usrId || 'ADMIN',
      mod_dtm: now,
      ...(body.planNm ? { plan_nm: body.planNm } : {}),
      ...(stsCd ? { sts_cd: stsCd } : {}),
      ...(body.del ? { del_yn: 'Y', del_dtm: now } : {}),
    }
    const { data, error } = await db()
      .from('dbm_mig_plan')
      .update(patch)
      .eq('mig_plan_id', planId)
      .eq('lnk_id', link.linkId)
      .eq('del_yn', 'N')
      .select('chnk_sz, prll_cnt, chk_json, sts_cd, plan_nm, mod_dtm')
      .maybeSingle()
    if (error) return dbFail(error)
    if (!data) return apiError('NOT_FOUND', 404)
    return NextResponse.json({ plan: data })
  }),
)
