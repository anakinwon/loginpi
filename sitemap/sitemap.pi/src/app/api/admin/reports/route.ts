// 관리자 신고 대기열 API — GET ?sts=RECEIVED&page= (기본 RECEIVED, 접수순). 대상 사이트·신고자 Pi 사용자명 임베드. isAdmin 게이트
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import {
  apiError,
  db,
  dbFail,
  dbRoute,
  pageParam,
  requireAdmin,
} from '@/lib/api'
import { LIMITS } from '@/lib/site'

export const dynamic = 'force-dynamic'

const RPT_STS = ['RECEIVED', 'ACCEPTED', 'DISMISSED']

export const GET = withGuard(
  dbRoute(async (req) => {
    const admin = await requireAdmin(req)
    if (admin instanceof NextResponse) return admin
    const sts = req.nextUrl.searchParams.get('sts') ?? 'RECEIVED'
    if (!RPT_STS.includes(sts)) return apiError('INVALID_INPUT', 400)
    const page = pageParam(req)
    const size = LIMITS.adminPageSize

    const { data, error, count } = await db()
      .from('site_rpt')
      .select(
        'rpt_id, site_id, rpt_rsn_cd, rpt_cont, rpt_sts_cd, prcs_dtm, prcs_cont, reg_dtm, site_mst(site_dom_nm, site_nm, site_sts_cd), sys_user(pi_username)',
        { count: 'exact' },
      )
      .eq('del_yn', 'N')
      .eq('rpt_sts_cd', sts)
      .order('reg_dtm', { ascending: true })
      .order('rpt_id')
      .range((page - 1) * size, page * size - 1)
    if (error) return dbFail(error)
    return NextResponse.json({
      items: data ?? [],
      total: count ?? 0,
      page,
      pageSize: size,
    })
  }),
)
