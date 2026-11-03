// 공개 사이트 상세 API — GET /api/sites/<domain> : IN_USE(사용 중)·활성 사이트 공개 컬럼 + 조회수 합계(stat_site_dly.view_cnt 합) + 이동 안내 기체(ship, shipOn — null = 기본 SAUCER)
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
  shipOn,
  type PublicSite,
} from '@/lib/site'
import type { ShipPaidCd } from '@/lib/ship'
import { selectWithShip } from '@/lib/ship-compat'

export const dynamic = 'force-dynamic'

export const GET = withGuard(
  dbRoute(async (_req, ctx) => {
    const domain = decodeDomain(await routeParam(ctx, 'domain'))
    if (!DOMAIN_RE.test(domain)) return apiError('NOT_FOUND', 404)

    // ship_* 칼럼(sql/020) 없는 DB 는 ship 빼고 재시도 → ship=null(기본 SAUCER)
    const { data: row, error } = await selectWithShip(
      `${PUBLIC_SITE_COLS}, ship_cd, ship_pay_dtm`,
      (cols) =>
        db()
          .from('site_mst')
          .select(cols)
          .eq('site_dom_nm', domain)
          .eq('del_yn', 'N')
          .eq('site_sts_cd', 'IN_USE')
          .maybeSingle<
            PublicSite & {
              ship_cd: ShipPaidCd | null
              ship_pay_dtm: string | null
            }
          >(),
    )
    if (error) return dbFail(error)
    if (!row) return apiError('NOT_FOUND', 404)
    const { ship_cd, ship_pay_dtm, ...site } = row
    const ship = shipOn({
      ship_cd,
      ship_pay_dtm,
      own_site_yn: site.own_site_yn,
    })

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

    return NextResponse.json({ site, viewCnt, ship }, { headers: PUBLIC_CACHE })
  }),
)
