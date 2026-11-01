// 느린 쿼리 Top-N(PRD 12 §3-2, ANL-R03) — GET /api/perf/top?link=&conn=&page=&sort=total|mean|calls
//  최근 수집 2건의 쿼리 통계 → 증감(stat_reset 변경·호출 감소 = 리셋 보정, src/lib/perf/calc.ts) → 정렬·페이지(20건)
//  → 페이지 20건의 출처 표본(dbm_prf_qry_src, sql/032) 1회 조회 → 행마다 src {cd, conf, smpCnt, top}(계정 = 확정, 앱 = 표본 추정)
//  qid = query_id 미수집 원인(ok·ver·priv·off — 보드·활동 탭 표본에서, 인스턴스 캐시라 없으면 null)
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { db, dbFail, dbRoute } from '@/lib/api'
import { qryDelta, type QryStat } from '@/lib/perf/calc'
import { latestClct, linkParams } from '@/lib/perf/server'
import { judgeSrc } from '@/lib/perf/source'
import { readQid, readQrySrc } from '@/lib/perf/source-store'

const PAGE = 20
type QryRow = {
  qry_id: string
  usr_nm?: string | null
  qry_txt: string | null
  call_cnt: number
  tot_ms: number
  row_cnt: number
}

async function qryOf(
  clctId: string,
): Promise<QryStat[] | { error: { code?: string; message?: string } }> {
  const sel = (cols: string) =>
    db()
      .from('dbm_prf_qry')
      .select(cols)
      .eq('clct_id', clctId)
      .eq('del_yn', 'N')
      .returns<QryRow[]>()
  let { data, error } = await sel(
    'qry_id, usr_nm, qry_txt, call_cnt, tot_ms, row_cnt',
  )
  // sql/032(usr_nm) 미적용 DB — 칼럼 없음(42703)이면 계정 없이 재조회(목록은 막지 않음, 출처는 표본 추정만)
  if (error?.code === '42703')
    ({ data, error } = await sel('qry_id, qry_txt, call_cnt, tot_ms, row_cnt'))
  if (error || !data) return { error: error ?? {} }
  return data.map((r) => ({
    qryId: r.qry_id,
    usrNm: r.usr_nm ?? null,
    qryTxt: r.qry_txt,
    calls: Number(r.call_cnt),
    totalMs: Number(r.tot_ms),
    rows: Number(r.row_cnt),
  }))
}

export const GET = withGuard(
  dbRoute(async (req) => {
    const sp = req.nextUrl.searchParams
    const p = await linkParams(req, sp.get('link'), sp.get('conn'))
    if (p instanceof NextResponse) return p
    const clcts = await latestClct(p.linkId, p.connId, 2)
    if (clcts instanceof NextResponse) return clcts
    const [cur, prev] = clcts
    const qid = readQid(p.linkId, p.connId)
    if (!cur)
      return NextResponse.json({
        clctDtm: null,
        prevDtm: null,
        pgss: false,
        rows: [],
        total: 0,
        page: 1,
        pageSize: PAGE,
        qid,
      })

    const [curQ, prevQ] = await Promise.all([
      qryOf(cur.clct_id),
      prev ? qryOf(prev.clct_id) : null,
    ])
    if ('error' in curQ) return dbFail(curQ.error)
    if (prevQ && 'error' in prevQ) return dbFail(prevQ.error)

    const resetChanged =
      !!prev && (prev.stat_reset_dtm ?? '') !== (cur.stat_reset_dtm ?? '')
    const sort = sp.get('sort')
    const key =
      sort === 'mean' ? 'meanMs' : sort === 'calls' ? 'calls' : 'totalMs'
    const all = qryDelta(curQ, prevQ, resetChanged).sort(
      (a, b) => b[key] - a[key],
    )
    const page = Math.max(1, Number(sp.get('page')) || 1)
    const pageRows = all.slice((page - 1) * PAGE, page * PAGE)
    // 앞 결과(페이지 쿼리ID)에 종속된 await — 허용(R-P1). 실패는 빈 표본(목록은 막지 않음)
    const smp = await readQrySrc(p.linkId, p.connId, [
      ...new Set(pageRows.map((r) => r.qryId)),
    ])
    const verNum = qid?.verNum ?? null
    return NextResponse.json({
      clctDtm: cur.clct_dtm,
      prevDtm: prev?.clct_dtm ?? null,
      pgss: cur.pgss_yn === 'Y',
      rows: pageRows.map((r) => ({
        ...r,
        src: judgeSrc(smp.get(r.qryId) ?? [], r.usrNm, verNum),
      })),
      qid,
      total: all.length,
      page,
      pageSize: PAGE,
    })
  }),
)
