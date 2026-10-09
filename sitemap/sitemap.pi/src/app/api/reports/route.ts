// 사이트 신고 API — POST { siteId, rsn, cont } (로그인 필수). 같은 사용자의 미처리 중복 신고는 23505 → 409 ALREADY_REPORTED
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import {
  apiError,
  db,
  dbFail,
  dbRoute,
  parseBody,
  requireUser,
} from '@/lib/api'
import { reportInputSchema } from '@/lib/site'

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    const user = await requireUser(req)
    if (user instanceof NextResponse) return user
    const body = await parseBody(req, reportInputSchema)
    if (body instanceof NextResponse) return body

    const { data: site, error: siteErr } = await db()
      .from('site_mst')
      .select('site_id')
      .eq('site_id', body.siteId)
      .eq('del_yn', 'N')
      .eq('site_sts_cd', 'APPROVED')
      .maybeSingle()
    if (siteErr) return dbFail(siteErr)
    if (!site) return apiError('NOT_FOUND', 404)

    const { error } = await db()
      .from('site_rpt')
      .insert({
        site_id: body.siteId,
        rptr_usr_id: user.id,
        rpt_rsn_cd: body.rsn,
        rpt_cont: body.cont ?? null,
        regr_id: user.id,
        modr_id: user.id,
      })
    if (error)
      return error.code === '23505'
        ? apiError('ALREADY_REPORTED', 409)
        : dbFail(error)
    return NextResponse.json({ ok: true }, { status: 201 })
  }),
)
