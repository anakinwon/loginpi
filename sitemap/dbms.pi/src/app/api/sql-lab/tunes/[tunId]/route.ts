// AI 튜닝 권고 1건 상태 변경 — PATCH /api/sql-lab/tunes/:tunId { linkId, act: approve|reject|measure, aftPlanId? } / DELETE ?link= (논리삭제)
//  measure = 승인 뒤 같은 접속(conn_id)·같은 SQL(sql_hash)·승인 이후 저장한 계획을 후 계획으로 기록 → 적용 완료(APLD). 측정 없이 적용 완료 불가(P42, DB CHECK 이중)
//  상태 갱신은 현재 상태 조건부 UPDATE(동시 처리 시 1건만 성공 — R-P5)
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { withGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, parseBody } from '@/lib/api'
import { requireUserLink } from '@/lib/sql-lab/server'
import {
  aftPlanError,
  nextStatus,
  TUN_COLS,
  type TunStatus,
} from '@/lib/sql-lab/tune'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const Body = z.object({
  linkId: z.string().regex(UUID),
  act: z.enum(['approve', 'reject', 'measure']),
  aftPlanId: z.string().regex(UUID).optional(),
})

const tunIdOf = async (ctx: unknown) => {
  const { tunId } = await (ctx as { params: Promise<{ tunId: string }> }).params
  return UUID.test(tunId) ? tunId : null
}
const fail = (code: string, status: number) =>
  NextResponse.json({ error: code, code }, { status })

export const PATCH = withGuard(
  dbRoute(async (req: NextRequest, ctx) => {
    const tunId = await tunIdOf(ctx)
    if (!tunId) return apiError('INVALID_INPUT', 400)
    const body = await parseBody(req, Body)
    if (body instanceof NextResponse) return body
    if (body.act === 'measure' && !body.aftPlanId)
      return apiError('INVALID_INPUT', 400)
    const [ok, tunR, aftR] = await Promise.all([
      requireUserLink(req, body.linkId, 'SQL_TUNE'),
      db()
        .from('dbm_sql_tun')
        .select('tun_sts_cd, conn_id, sql_hash, plan_id, aprv_dtm')
        .eq('tun_id', tunId)
        .eq('lnk_id', body.linkId)
        .eq('del_yn', 'N')
        .maybeSingle(),
      body.aftPlanId
        ? db()
            .from('dbm_sql_plan')
            .select('plan_id, conn_id, sql_hash, total_cost, reg_dtm')
            .eq('plan_id', body.aftPlanId)
            .eq('lnk_id', body.linkId)
            .eq('del_yn', 'N')
            .maybeSingle()
        : Promise.resolve(null),
    ])
    if (ok instanceof NextResponse) return ok
    if (tunR.error) return dbFail(tunR.error)
    if (aftR?.error) return dbFail(aftR.error)
    const tun = tunR.data as {
      tun_sts_cd: TunStatus
      conn_id: string
      sql_hash: string
      plan_id: string
      aprv_dtm: string | null
    } | null
    if (!tun) return apiError('NOT_FOUND', 404)
    const to = nextStatus(tun.tun_sts_cd, body.act)
    if (!to) return fail('TUN_BAD_STATE', 409)

    const now = new Date().toISOString()
    const patch: Record<string, unknown> = {
      tun_sts_cd: to,
      modr_id: ok.user.id,
      mod_dtm: now,
    }
    if (body.act === 'measure') {
      const aft = aftR?.data as {
        plan_id: string
        conn_id: string
        sql_hash: string
        total_cost: number
        reg_dtm: string
      } | null
      if (!aft) return apiError('NOT_FOUND', 404)
      // 후 계획 = 같은 접속·같은 SQL, 전 계획이 아닌 것, 승인 이후 저장(적용 뒤 다시 EXPLAIN 한 결과)
      const bad = aftPlanError(tun, aft)
      if (bad) return fail(bad, 400)
      Object.assign(patch, {
        aft_plan_id: aft.plan_id,
        aft_cost: aft.total_cost,
        msr_dtm: now,
      })
    } else Object.assign(patch, { aprv_id: ok.user.id, aprv_dtm: now })

    const { data, error } = await db()
      .from('dbm_sql_tun')
      .update(patch)
      .eq('tun_id', tunId)
      .eq('tun_sts_cd', tun.tun_sts_cd)
      .select(TUN_COLS)
      .maybeSingle()
    if (error) return dbFail(error)
    return data ? NextResponse.json({ item: data }) : fail('TUN_BAD_STATE', 409)
  }),
)

export const DELETE = withGuard(
  dbRoute(async (req: NextRequest, ctx) => {
    const tunId = await tunIdOf(ctx)
    const linkId = req.nextUrl.searchParams.get('link')
    if (!tunId || !linkId || !UUID.test(linkId))
      return apiError('INVALID_INPUT', 400)
    const ok = await requireUserLink(req, linkId, 'ANY')
    if (ok instanceof NextResponse) return ok
    const now = new Date().toISOString()
    const { data, error } = await db()
      .from('dbm_sql_tun')
      .update({ del_yn: 'Y', del_dtm: now, modr_id: ok.user.id, mod_dtm: now })
      .eq('tun_id', tunId)
      .eq('lnk_id', linkId)
      .eq('del_yn', 'N')
      .select('tun_id')
      .maybeSingle()
    if (error) return dbFail(error)
    return data ? NextResponse.json({ ok: true }) : apiError('NOT_FOUND', 404)
  }),
)
