// 공개 사이트 목록·검색 API — GET ?ctgr=&q=&page= (APPROVED·활성만, 승인일 역순, 페이지네이션, s-maxage 캐시)
// 검색은 pg_trgm GIN 가속 ilike(사이트명·도메인), q 최소 2자. 응답에서 pvt_cntc_txt 제외(PUBLIC_SITE_COLS)
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import {
  apiError,
  db,
  dbFail,
  dbRoute,
  pageParam,
  PUBLIC_CACHE,
} from '@/lib/api'
import { LIMITS, PUBLIC_SITE_COLS, SITE_CTGR, type SiteCtgr } from '@/lib/site'

export const dynamic = 'force-dynamic'

// PostgREST or 문자열 인젝션 방지 — 문자·숫자·공백·점·하이픈만 남기고(, ( ) " \ * % _ 제거) 큰따옴표로 감싼다
const sanitizeQuery = (q: string) =>
  q
    .replace(/[^\p{L}\p{N}\s.-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50)

export const GET = withGuard(
  dbRoute(async (req) => {
    const sp = req.nextUrl.searchParams
    const page = pageParam(req)
    const size = LIMITS.pageSize
    const ctgr = sp.get('ctgr')
    const q = sanitizeQuery(sp.get('q') ?? '')
    if (ctgr && !SITE_CTGR.includes(ctgr as SiteCtgr))
      return apiError('INVALID_INPUT', 400)
    if (sp.has('q') && q.length < LIMITS.searchMin)
      return apiError('INVALID_INPUT', 400)

    // 부분 인덱스(idx_site_mst_apv_dtm·site_ctgr_cd) 사용 조건 그대로 : del_yn='N' AND site_sts_cd='APPROVED'
    let query = db()
      .from('site_mst')
      .select(PUBLIC_SITE_COLS, { count: 'exact' })
      .eq('del_yn', 'N')
      .eq('site_sts_cd', 'APPROVED')
    if (ctgr) query = query.eq('site_ctgr_cd', ctgr)
    if (q) {
      const pat = `"%${q}%"`
      query = query.or(`site_nm.ilike.${pat},site_dom_nm.ilike.${pat}`)
    }
    const { data, error, count } = await query
      .order('apv_dtm', { ascending: false })
      .order('site_id')
      .range((page - 1) * size, page * size - 1)
    if (error) return dbFail(error)

    return NextResponse.json(
      { items: data ?? [], total: count ?? 0, page, pageSize: size },
      { headers: PUBLIC_CACHE },
    )
  }),
)
