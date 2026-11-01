// GET /api/monitor/summary?link=&min= — schema.pi 모니터 요약 읽기 연계(결정 D7, 수집은 schema.pi). 정규화된 요약 반환, 저장 없음
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { dbRoute } from '@/lib/api'
import { linkGet } from '@/lib/link/client'
import { isPeriod, normalizeSummary } from '@/lib/monitor/rules'
import { linkFail, linkGate } from '@/lib/monitor/server'

export const GET = withGuard(
  dbRoute(async (req) => {
    const sp = req.nextUrl.searchParams
    const min = Number(sp.get('min') ?? 60)
    if (!isPeriod(min)) return NextResponse.json({ error: 'INVALID_INPUT', code: 'INVALID_INPUT' }, { status: 400 })
    const g = await linkGate(req, sp.get('link'))
    if (g instanceof NextResponse) return g
    try {
      const raw = await linkGet<unknown>(g.linkId, `/mon/summary?min=${min}`)
      return NextResponse.json(
        { summary: normalizeSummary(raw, min), areaNm: g.areaNm, at: new Date().toISOString() },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    } catch (e) {
      return linkFail(e)
    }
  }),
)
