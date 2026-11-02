// 느린 쿼리 Top-N(PRD 12 §3-2, ANL-R03) — GET /api/perf/top?link=&conn=&page=&sort=max|total|mean|calls
//  최근 수집 2건의 쿼리 통계(블록 수 sql/034 포함) → 증감(stat_reset 변경·호출 감소 = 리셋 보정, src/lib/perf/calc.ts) → 정렬·페이지(20건)
//  → 페이지 20건의 출처 표본(dbm_prf_qry_src, sql/032) 1회 조회 → 행마다 src {cd, conf, smpCnt, top}(계정 = 확정, 앱 = 표본 추정)
//  qid = query_id 미수집 원인(ok·ver·priv·off — 보드·활동 탭 표본에서, 인스턴스 캐시라 없으면 null)
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { db, dbFail, dbRoute } from '@/lib/api'
import { qryDelta, type QryStat } from '@/lib/perf/calc'
import { isNoCol, latestClct, linkParams } from '@/lib/perf/server'
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
  max_ms?: number | null
  blks_hit_cnt?: number | null
  blks_read_cnt?: number | null
  tmp_blks_wrt_cnt?: number | null
}
const numN = (v: number | null | undefined) => (v == null ? null : Number(v))

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
  const base = 'qry_id, qry_txt, call_cnt, tot_ms, row_cnt'
  // sql/034(블록)·033(max_ms)·032(usr_nm) 미적용 DB — 칼럼 없음(42703·PGRST204)이면 새 칼럼부터 빼고 재조회(목록은 막지 않음)
  const cols = [
    `${base}, usr_nm, max_ms, blks_hit_cnt, blks_read_cnt, tmp_blks_wrt_cnt`,
    `${base}, usr_nm, max_ms`,
    `${base}, usr_nm`,
    base,
  ]
  let { data, error } = await sel(cols[0])
  for (const c of cols.slice(1)) {
    if (!isNoCol(error)) break
    ;({ data, error } = await sel(c))
  }
  if (error || !data) return { error: error ?? {} }
  return data.map((r) => ({
    qryId: r.qry_id,
    usrNm: r.usr_nm ?? null,
    qryTxt: r.qry_txt,
    calls: Number(r.call_cnt),
    totalMs: Number(r.tot_ms),
    rows: Number(r.row_cnt),
    maxMs: numN(r.max_ms),
    blkHit: numN(r.blks_hit_cnt),
    blkRead: numN(r.blks_read_cnt),
    tmpBlk: numN(r.tmp_blks_wrt_cnt),
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
    // 기본 정렬 = 1회 최고(max, 마스터 2026-11-02). max 없는 행(033 이전 수집)은 max 있는 행 뒤, 그들끼리는 1회 평균(근사) 순 — 총 시간 순 금지
    //  화면은 noMaxCnt 로 '최고값 없음 — 1회 평균으로 임시 정렬' 배너 + 지금 수집
    const sort = sp.get('sort')
    const key =
      sort === 'mean'
        ? 'meanMs'
        : sort === 'calls'
          ? 'calls'
          : sort === 'total'
            ? 'totalMs'
            : 'maxMs'
    const all = qryDelta(curQ, prevQ, resetChanged).sort((a, b) => {
      const x = a[key]
      const y = b[key]
      if (x == null || y == null)
        return x == null && y == null ? b.meanMs - a.meanMs : x == null ? 1 : -1
      return y - x || b.meanMs - a.meanMs
    })
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
        src: judgeSrc(smp.get(r.qryId) ?? [], r.usrNm, verNum, r.qryTxt), // 쿼리문 지문 = 자체 수집이면 MONITOR 확정
      })),
      qid,
      noMaxCnt: all.filter((r) => r.maxMs == null).length,
      total: all.length,
      page,
      pageSize: PAGE,
    })
  }),
)
