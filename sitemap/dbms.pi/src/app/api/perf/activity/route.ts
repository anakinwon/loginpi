// 활동·락 실시간(PRD 12 §3-5, ANL-R05) — GET /api/perf/activity?link=&conn=
//  이름 붙인 조회 activity·locks 병렬, 저장 안 함. 쿼리문 칼럼은 상수 마스킹(방어), 각 200행 상한
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { dbRoute } from '@/lib/api'
import { linkQuery, type QueryResult } from '@/lib/link/client'
import { maskLiterals } from '@/lib/perf/calc'
import { linkFail, linkParams } from '@/lib/perf/server'

const CAP = 200
const TEXT_COLS = new Set(['query', 'qry_txt', 'query_text'])

function masked(r: QueryResult) {
  const idx = r.cols.map((c, i) => (TEXT_COLS.has(c.toLowerCase()) ? i : -1)).filter((i) => i >= 0)
  return {
    cols: r.cols,
    rows: r.rows.slice(0, CAP).map((row) => row.map((v, i) => (idx.includes(i) && typeof v === 'string' ? maskLiterals(v).slice(0, 1000) : v))),
    ms: r.ms,
  }
}

export const GET = withGuard(
  dbRoute(async (req) => {
    const sp = req.nextUrl.searchParams
    const p = await linkParams(req, sp.get('link'), sp.get('conn'))
    if (p instanceof NextResponse) return p
    try {
      const [act, lck] = await Promise.all([linkQuery(p.linkId, p.connId, 'activity'), linkQuery(p.linkId, p.connId, 'locks')])
      return NextResponse.json({ activity: masked(act), locks: masked(lck) }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (e) {
      return linkFail(e)
    }
  }),
)
