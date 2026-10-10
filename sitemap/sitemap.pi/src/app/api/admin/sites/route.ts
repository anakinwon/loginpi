// 관리자 심사 대기열 API — GET ?sts=PENDING&page= (기본 PENDING, 접수순). 비공개 연락처·등록자 Pi 사용자명·도메인 소유 확인 토큰 포함. isAdmin 게이트(401/403)
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import {
  apiError,
  db,
  dbFail,
  dbRoute,
  pageParam,
  requireAdmin,
  verifyToken,
} from '@/lib/api'
import { LIMITS, OWNER_SITE_COLS, SITE_STS, type SiteSts } from '@/lib/site'

export const dynamic = 'force-dynamic'

export const GET = withGuard(
  dbRoute(async (req) => {
    const admin = await requireAdmin(req)
    if (admin instanceof NextResponse) return admin
    const sts = req.nextUrl.searchParams.get('sts') ?? 'PENDING'
    if (!SITE_STS.includes(sts as SiteSts))
      return apiError('INVALID_INPUT', 400)
    const page = pageParam(req)
    const size = LIMITS.adminPageSize

    const { data, error, count } = await db()
      .from('site_mst')
      .select(`${OWNER_SITE_COLS}, sys_user!site_mst_sys_user_id_fkey(pi_username:pi_usr_nm)`, { count: 'exact' })
      .eq('del_yn', 'N')
      .eq('site_sts_cd', sts)
      .order('reg_dtm', { ascending: true })
      .order('site_id')
      .range((page - 1) * size, page * size - 1)
    if (error) return dbFail(error)
    return NextResponse.json({
      items: (data ?? []).map((s) => ({
        ...s,
        vrfy_tkn: verifyToken(s.site_id, s.site_dom_nm),
      })),
      total: count ?? 0,
      page,
      pageSize: size,
    })
  }),
)
