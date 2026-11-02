// GET /api/analytics/lake?link=[&prj=] — 레이크 3층 설계 미리보기(PRD 12 §8-1) : prj 없으면 schema.pi 프로젝트 목록, 있으면 /model → 3층 매핑(이름만)
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { dbRoute } from '@/lib/api'
import { linkGet } from '@/lib/link/client'
import { buildLake, overallConform, PRJ_ID_RE, type ModelRes, type Project } from '@/lib/analytics/lake'
import { linkFail, linkGate } from '@/lib/monitor/server'

export const GET = withGuard(
  dbRoute(async (req) => {
    const sp = req.nextUrl.searchParams
    const prj = sp.get('prj')
    if (prj !== null && !PRJ_ID_RE.test(prj)) return NextResponse.json({ error: 'INVALID_INPUT', code: 'INVALID_INPUT' }, { status: 400 })
    const g = await linkGate(req, sp.get('link'), 'LAKE')
    if (g instanceof NextResponse) return g
    try {
      if (!prj) return NextResponse.json({ projects: await linkGet<Project[]>(g.linkId, '/projects') })
      const tables = buildLake(await linkGet<ModelRes>(g.linkId, `/model?prjId=${encodeURIComponent(prj)}`))
      return NextResponse.json({ tables, cnfmPct: overallConform(tables) })
    } catch (e) {
      return linkFail(e)
    }
  }),
)
