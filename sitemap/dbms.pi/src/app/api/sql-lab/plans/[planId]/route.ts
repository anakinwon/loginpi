// 저장한 실행계획 1건 — GET /api/sql-lab/plans/:planId?link= (비교용 상세) / DELETE ?link= (논리삭제 del_yn='Y', 물리 DELETE 금지)
import { NextResponse, type NextRequest } from 'next/server'
import { withGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute } from '@/lib/api'
import { requireUserLink, resolveLink } from '@/lib/sql-lab/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function args(req: NextRequest, ctx: unknown) {
  const { planId } = await (ctx as { params: Promise<{ planId: string }> }).params
  const linkId = req.nextUrl.searchParams.get('link')
  return UUID.test(planId) && linkId ? { planId, linkId } : null
}

export const GET = withGuard(
  dbRoute(async (req, ctx) => {
    const a = await args(req, ctx)
    if (!a) return apiError('INVALID_INPUT', 400)
    const link = await resolveLink(req, a.linkId, 'ANY')
    if (link instanceof NextResponse) return link
    const { data, error } = await db()
      .from('dbm_sql_plan')
      .select('plan_id, conn_id, plan_nm, sql_txt, plan_json, total_cost, reg_dtm')
      .eq('plan_id', a.planId)
      .eq('lnk_id', a.linkId)
      .eq('del_yn', 'N')
      .maybeSingle()
    if (error) return dbFail(error)
    return data ? NextResponse.json(data) : apiError('NOT_FOUND', 404)
  }),
)

export const DELETE = withGuard(
  dbRoute(async (req, ctx) => {
    const a = await args(req, ctx)
    if (!a) return apiError('INVALID_INPUT', 400)
    const ok = await requireUserLink(req, a.linkId, 'ANY')
    if (ok instanceof NextResponse) return ok
    const { data, error } = await db()
      .from('dbm_sql_plan')
      .update({ del_yn: 'Y', del_dtm: new Date().toISOString(), modr_id: ok.user.id })
      .eq('plan_id', a.planId)
      .eq('lnk_id', a.linkId)
      .eq('del_yn', 'N')
      .select('plan_id')
    if (error) return dbFail(error)
    return data.length ? NextResponse.json({ ok: true }) : apiError('NOT_FOUND', 404)
  }),
)
