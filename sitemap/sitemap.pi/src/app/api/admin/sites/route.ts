// 관리자 신청 목록 API — GET ?sts=PAID&page=&size= (기본 IN_USE = 사용중, 비싼 요금제 → 결제일시 내림차순 → 접수순). 비공개 연락처·등록자 Pi 사용자명·도메인 소유 확인 토큰 포함. isAdmin 게이트(401/403)
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import {
  apiError,
  db,
  dbFail,
  dbRoute,
  pageParam,
  requireAdmin,
  sizeParam,
  verifyToken,
} from '@/lib/api'
import {
  LIMITS,
  OWNER_SITE_COLS,
  SITE_STS,
  type OwnerSite,
  type SiteSts,
} from '@/lib/site'
import { selectWithShip } from '@/lib/ship-compat'

export const dynamic = 'force-dynamic'

export const GET = withGuard(
  dbRoute(async (req) => {
    const admin = await requireAdmin(req)
    if (admin instanceof NextResponse) return admin
    const sts = req.nextUrl.searchParams.get('sts') ?? 'IN_USE'
    if (!SITE_STS.includes(sts as SiteSts))
      return apiError('INVALID_INPUT', 400)
    const page = pageParam(req)
    const size = sizeParam(req, LIMITS.adminPageSize)

    // ship_* 칼럼(sql/020) 없는 DB 는 ship 빼고 재시도 → ship=null
    const { data, error, count } = await selectWithShip(
      `${OWNER_SITE_COLS}, plan_sort_no, pi_pymnt!site_mst_pi_pymnt_id_fkey(pi_amt), sys_user!site_mst_sys_user_id_fkey(pi_username:pi_usr_nm)`,
      (cols) =>
        db()
          .from('site_mst')
          .select(cols, { count: 'exact' })
          .eq('del_yn', 'N')
          .eq('site_sts_cd', sts)
          // 정렬(마스터 지시 2026-10-13) : 비싼 요금제부터(plan_sort_no, sql/011 생성 컬럼) → 결제일시 내림차순(미결제는 뒤) → 접수순
          .order('plan_sort_no', { ascending: false })
          .order('pay_dtm', { ascending: false, nullsFirst: false })
          .order('reg_dtm', { ascending: true })
          .order('site_id')
          .range((page - 1) * size, page * size - 1)
          .overrideTypes<OwnerSite[], { merge: false }>(),
    )
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
