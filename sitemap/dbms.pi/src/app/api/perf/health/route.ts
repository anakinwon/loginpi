// 테이블·인덱스 건강(PRD 12 §3-3, ANL-R03) — GET /api/perf/health?link=&conn=
//  최근 수집 1건의 테이블·인덱스 통계 → 미사용 인덱스(idx_scan 0)·전체 스캔 과다·dead tuple 비율(src/lib/perf/calc.ts health). 각 목록 상한 50
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { db, dbFail, dbRoute } from '@/lib/api'
import { health, HEALTH } from '@/lib/perf/calc'
import { latestClct, linkParams } from '@/lib/perf/server'

const CAP = 50

export const GET = withGuard(
  dbRoute(async (req) => {
    const sp = req.nextUrl.searchParams
    const p = await linkParams(req, sp.get('link'), sp.get('conn'))
    if (p instanceof NextResponse) return p
    const clcts = await latestClct(p.linkId, p.connId, 1)
    if (clcts instanceof NextResponse) return clcts
    const cur = clcts[0]
    if (!cur) return NextResponse.json({ clctDtm: null, unusedIdx: [], fullScan: [], dead: [], rule: HEALTH })

    const [t, i] = await Promise.all([
      db()
        .from('dbm_prf_tbl')
        .select('tbl_nm, full_scan_cnt, idx_scan_cnt, live_tup_cnt, dead_tup_cnt, tot_sz_byte')
        .eq('clct_id', cur.clct_id)
        .eq('del_yn', 'N'),
      db().from('dbm_prf_idx').select('tbl_nm, idx_nm, idx_scan_cnt, idx_sz_byte').eq('clct_id', cur.clct_id).eq('del_yn', 'N'),
    ])
    if (t.error) return dbFail(t.error)
    if (i.error) return dbFail(i.error)
    const h = health(
      t.data.map((r) => ({
        tblNm: r.tbl_nm,
        fullScan: Number(r.full_scan_cnt),
        idxScan: Number(r.idx_scan_cnt),
        liveTup: Number(r.live_tup_cnt),
        deadTup: Number(r.dead_tup_cnt),
        szByte: r.tot_sz_byte === null ? null : Number(r.tot_sz_byte),
      })),
      i.data.map((r) => ({ idxNm: r.idx_nm, tblNm: r.tbl_nm, idxScan: Number(r.idx_scan_cnt), szByte: r.idx_sz_byte === null ? null : Number(r.idx_sz_byte) })),
    )
    return NextResponse.json({
      clctDtm: cur.clct_dtm,
      unusedIdx: h.unusedIdx.slice(0, CAP),
      fullScan: h.fullScan.slice(0, CAP),
      dead: h.dead.slice(0, CAP),
      rule: HEALTH,
    })
  }),
)
