// 정합 탐지 실행 이력 — GET /api/drift/runs?link=&page=. 연결별 최근순 10건 페이지(x_dbm_drift_run_01)
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute } from '@/lib/api'
import { requireLink } from '@/lib/link/client'

const PAGE_SIZE = 10

export const GET = withGuard(
  dbRoute(async (req) => {
    const sp = req.nextUrl.searchParams
    const linkId = sp.get('link') ?? ''
    if (!linkId) return apiError('INVALID_INPUT', 400)
    const page = Math.max(1, Math.min(1000, Number(sp.get('page')) || 1))
    const ctx = await requireLink(req, linkId, 'DRIFT_VIEW')
    if (ctx instanceof Response) return ctx as NextResponse

    const from = (page - 1) * PAGE_SIZE
    // 건수는 화면 페이지 표시에 쓴다(R-P3)
    const { data, error, count } = await db()
      .from('dbm_drift_run')
      .select('drift_run_id, conn_id, prj_id, prj_nm, run_dtm, smry_json', { count: 'exact' })
      .eq('lnk_id', ctx.linkId)
      .eq('del_yn', 'N')
      .order('run_dtm', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (error) return dbFail(error)
    return NextResponse.json({ runs: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE })
  }),
)
