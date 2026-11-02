// 실행계획 조회 — POST /api/sql-lab/explain { linkId, connId, sql } → schema.pi 이름 붙인 조회 'explain'(SELECT/WITH 1문장, ANALYZE 없음 — 계약 D2)
//  응답 { plan, warnings, ms } — 계획 원본은 고객 상수가 들어 있을 수 있어 화면 표시용으로만 돌려주고 저장은 plans API(마스킹 후)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withGuard } from '@pi/guard'
import { apiError, dbRoute, parseBody } from '@/lib/api'
import { linkQuery } from '@/lib/link/client'
import { analyzePlan, isSingleSelect, parsePlan } from '@/lib/sql-lab/plan'
import { linkFail, resolveLink } from '@/lib/sql-lab/server'

const Body = z.object({
  linkId: z.string().min(1).max(64),
  connId: z.string().min(1).max(64),
  sql: z.string().min(1).max(20_000),
})

export const POST = withGuard(
  dbRoute(async (req) => {
    const body = await parseBody(req, Body)
    if (body instanceof NextResponse) return body
    if (!isSingleSelect(body.sql))
      return NextResponse.json({ error: 'SQL_NOT_SELECT', code: 'SQL_NOT_SELECT' }, { status: 400 })
    const link = await resolveLink(req, body.linkId, 'SQL_EXPLAIN')
    if (link instanceof NextResponse) return link
    try {
      const r = await linkQuery(body.linkId, body.connId, 'explain', { sql: body.sql })
      const plan = parsePlan(r.rows[0]?.[0])
      if (!plan) return apiError('QUERY_FAILED', 502)
      return NextResponse.json({ plan, warnings: analyzePlan(plan), ms: r.ms })
    } catch (e) {
      return linkFail(e)
    }
  }),
)
