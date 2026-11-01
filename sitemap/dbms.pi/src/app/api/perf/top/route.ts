// 느린 쿼리 Top-N(PRD 12 §3-2, ANL-R03) — GET /api/perf/top?link=&conn=&page=&sort=total|mean|calls
//  최근 수집 2건의 쿼리 통계 → 증감(stat_reset 변경·호출 감소 = 리셋 보정, src/lib/perf/calc.ts) → 정렬·페이지(20건)
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { db, dbFail, dbRoute } from '@/lib/api'
import { qryDelta, type QryStat } from '@/lib/perf/calc'
import { latestClct, linkParams } from '@/lib/perf/server'

const PAGE = 20

async function qryOf(clctId: string): Promise<QryStat[] | { error: { code?: string; message?: string } }> {
  const { data, error } = await db()
    .from('dbm_prf_qry')
    .select('qry_id, qry_txt, call_cnt, tot_ms, row_cnt')
    .eq('clct_id', clctId)
    .eq('del_yn', 'N')
  if (error) return { error }
  return data.map((r) => ({ qryId: r.qry_id, qryTxt: r.qry_txt, calls: Number(r.call_cnt), totalMs: Number(r.tot_ms), rows: Number(r.row_cnt) }))
}

export const GET = withGuard(
  dbRoute(async (req) => {
    const sp = req.nextUrl.searchParams
    const p = await linkParams(req, sp.get('link'), sp.get('conn'))
    if (p instanceof NextResponse) return p
    const clcts = await latestClct(p.linkId, p.connId, 2)
    if (clcts instanceof NextResponse) return clcts
    const [cur, prev] = clcts
    if (!cur) return NextResponse.json({ clctDtm: null, prevDtm: null, pgss: false, rows: [], total: 0, page: 1, pageSize: PAGE })

    const [curQ, prevQ] = await Promise.all([qryOf(cur.clct_id), prev ? qryOf(prev.clct_id) : null])
    if ('error' in curQ) return dbFail(curQ.error)
    if (prevQ && 'error' in prevQ) return dbFail(prevQ.error)

    const resetChanged = !!prev && (prev.stat_reset_dtm ?? '') !== (cur.stat_reset_dtm ?? '')
    const sort = sp.get('sort')
    const key = sort === 'mean' ? 'meanMs' : sort === 'calls' ? 'calls' : 'totalMs'
    const all = qryDelta(curQ, prevQ, resetChanged).sort((a, b) => b[key] - a[key])
    const page = Math.max(1, Number(sp.get('page')) || 1)
    return NextResponse.json({
      clctDtm: cur.clct_dtm,
      prevDtm: prev?.clct_dtm ?? null,
      pgss: cur.pgss_yn === 'Y',
      rows: all.slice((page - 1) * PAGE, page * PAGE),
      total: all.length,
      page,
      pageSize: PAGE,
    })
  }),
)
