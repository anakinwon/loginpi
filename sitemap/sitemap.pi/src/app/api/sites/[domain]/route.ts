// 공개 사이트 상세 API — GET /api/sites/<domain> : IN_USE(사용 중)·활성 사이트 공개 컬럼 + 조회수 합계(stat_site_dly.view_cnt 합)
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import {
  apiError,
  db,
  dbFail,
  dbRoute,
  PUBLIC_CACHE,
  routeParam,
} from '@/lib/api'
import {
  decodeDomain,
  DOMAIN_RE,
  PUBLIC_SITE_COLS,
  type PublicSite,
} from '@/lib/site'

export const dynamic = 'force-dynamic'

export const GET = withGuard(
  dbRoute(async (_req, ctx) => {
    const domain = decodeDomain(await routeParam(ctx, 'domain'))
    if (!DOMAIN_RE.test(domain)) return apiError('NOT_FOUND', 404)

    const { data: site, error } = await db()
      .from('site_mst')
      .select(PUBLIC_SITE_COLS)
      .eq('site_dom_nm', domain)
      .eq('del_yn', 'N')
      .eq('site_sts_cd', 'IN_USE')
      .maybeSingle<PublicSite>()
    if (error) return dbFail(error)
    if (!site) return apiError('NOT_FOUND', 404)

    // 조회수 합계는 DB SUM(sql/018) — 행을 받아 합산하면 1000행 상한에서 과소(R-P3)
    let viewCnt: number
    const sum = await db().rpc('fn_sel_site_view_sum', {
      p_site_id: site.site_id,
    })
    if (!sum.error) viewCnt = Number(sum.data ?? 0)
    else if (sum.error.code === 'PGRST202') {
      // sql/018 미적용 DB 폴백 — 기존 행 합산(사이트당 연 365행)
      const { data: stats, error: statErr } = await db()
        .from('stat_site_dly')
        .select('view_cnt')
        .eq('site_id', site.site_id)
        .eq('del_yn', 'N')
      if (statErr) return dbFail(statErr)
      viewCnt = (stats ?? []).reduce(
        (sum, r) => sum + (r.view_cnt as number),
        0,
      )
    } else return dbFail(sum.error)

    return NextResponse.json({ site, viewCnt }, { headers: PUBLIC_CACHE })
  }),
)
