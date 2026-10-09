// 공개 사이트 상세 API — GET /api/sites/<domain> : APPROVED·활성 사이트 공개 컬럼 + 조회수 합계(stat_site_dly.view_cnt 합)
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
      .eq('site_sts_cd', 'APPROVED')
      .maybeSingle<PublicSite>()
    if (error) return dbFail(error)
    if (!site) return apiError('NOT_FOUND', 404)

    // ponytail: 사이트당 연 365행 합산 — 느려지면 site_mst 누계 반정규화(DDL 판정 10)
    const { data: stats, error: statErr } = await db()
      .from('stat_site_dly')
      .select('view_cnt')
      .eq('site_id', site.site_id)
      .eq('del_yn', 'N')
    if (statErr) return dbFail(statErr)
    const viewCnt = (stats ?? []).reduce(
      (sum, r) => sum + (r.view_cnt as number),
      0,
    )

    return NextResponse.json({ site, viewCnt }, { headers: PUBLIC_CACHE })
  }),
)
