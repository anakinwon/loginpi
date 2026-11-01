// 저장한 실행계획 — GET /api/sql-lab/plans?link=&page=&hash= (목록, 20건 단위) / POST { linkId, connId, sql, plan, name } (저장)
//  저장 전 상수 마스킹(계약 A3 — 고객 값 미저장) : SQL 텍스트·계획 조건식의 문자열·숫자 상수를 ? 로 바꾼다
import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, parseBody } from '@/lib/api'
import { maskLiterals, maskPlan, normalizeSql, parsePlan, totalCost } from '@/lib/sql-lab/plan'
import { requireUserLink, resolveLink } from '@/lib/sql-lab/server'

const PAGE_SIZE = 20
const MAX_PLAN_BYTES = 512 * 1024

const Body = z.object({
  linkId: z.string().min(1).max(64),
  connId: z.string().min(1).max(64),
  sql: z.string().min(1).max(20_000),
  plan: z.unknown(),
  name: z.string().trim().max(100).optional(),
})

export const GET = withGuard(
  dbRoute(async (req) => {
    const sp = req.nextUrl.searchParams
    const linkId = sp.get('link')
    if (!linkId) return apiError('INVALID_INPUT', 400)
    const page = Math.max(1, Number(sp.get('page')) || 1)
    const hash = sp.get('hash')
    const link = await resolveLink(req, linkId)
    if (link instanceof NextResponse) return link
    // 다음 쪽 유무는 1건 더 읽어 판단(정확 건수 미사용 — R-P3)
    let q = db()
      .from('dbm_sql_plan')
      .select('plan_id, conn_id, plan_nm, sql_hash, total_cost, reg_dtm')
      .eq('lnk_id', linkId)
      .eq('del_yn', 'N')
      .order('reg_dtm', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    if (hash && /^[0-9a-f]{64}$/.test(hash)) q = q.eq('sql_hash', hash)
    const { data, error } = await q
    if (error) return dbFail(error)
    return NextResponse.json({ items: data.slice(0, PAGE_SIZE), page, hasNext: data.length > PAGE_SIZE })
  }),
)

export const POST = withGuard(
  dbRoute(async (req) => {
    const body = await parseBody(req, Body)
    if (body instanceof NextResponse) return body
    const plan = parsePlan(body.plan)
    if (!plan) return apiError('INVALID_INPUT', 400)
    const masked = maskPlan(plan)
    if (JSON.stringify(masked).length > MAX_PLAN_BYTES) return NextResponse.json({ error: 'PAYLOAD_TOO_LARGE', code: 'PAYLOAD_TOO_LARGE' }, { status: 413 })
    const ok = await requireUserLink(req, body.linkId)
    if (ok instanceof NextResponse) return ok
    const { data, error } = await db()
      .from('dbm_sql_plan')
      .insert({
        lnk_id: body.linkId,
        conn_id: body.connId,
        plan_nm: body.name || null,
        sql_hash: createHash('sha256').update(normalizeSql(body.sql)).digest('hex'),
        sql_txt: maskLiterals(body.sql),
        plan_json: masked,
        total_cost: totalCost(plan),
        regr_id: ok.user.id,
        modr_id: ok.user.id,
      })
      .select('plan_id, sql_hash')
      .single()
    if (error) return dbFail(error)
    return NextResponse.json(data)
  }),
)
