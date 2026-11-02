// 파이프라인 정의 목록·생성 — GET /api/pipeline?link=&page= (10건 페이지) · POST /api/pipeline { link, pplNm, srcConnId, tgtDesc, adapterCd, schedTxt, def }
//  PRD 12 §7-2 설계 전용(D6) — 상태 DRAFT 고정, 실행 없음. 이름 중복(x_dbm_ppl_02) = 409
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, parseBody } from '@/lib/api'
import { requireLink } from '@/lib/link/client'
import { LIST_COLS, PplInput, nameDup, toRow } from '@/lib/pipeline/input'

const PAGE_SIZE = 10

export const GET = withGuard(
  dbRoute(async (req) => {
    const sp = req.nextUrl.searchParams
    const linkId = sp.get('link') ?? ''
    if (!linkId) return apiError('INVALID_INPUT', 400)
    const page = Math.max(1, Math.min(1000, Number(sp.get('page')) || 1))
    const ctx = await requireLink(req, linkId, 'LAKE')
    if (ctx instanceof Response) return ctx as NextResponse

    const from = (page - 1) * PAGE_SIZE
    // 건수는 화면 페이지 표시에 쓴다(R-P3)
    const { data, error, count } = await db()
      .from('dbm_ppl')
      .select(LIST_COLS, { count: 'exact' })
      .eq('lnk_id', ctx.linkId)
      .eq('del_yn', 'N')
      .order('mod_dtm', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (error) return dbFail(error)
    return NextResponse.json({ items: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE })
  }),
)

export const POST = withGuard(
  dbRoute(async (req) => {
    const body = await parseBody(req, PplInput)
    if (body instanceof NextResponse) return body
    const ctx = await requireLink(req, body.link, 'LAKE')
    if (ctx instanceof Response) return ctx as NextResponse

    // 등록자·변경자 = 세션 사용자(requireLink 가 돌려준 usrId — 세션 재조회 없음, R-P2)
    const { data, error } = await db()
      .from('dbm_ppl')
      .insert({ ...toRow(body, ctx.usrId || 'ADMIN'), lnk_id: ctx.linkId, regr_id: ctx.usrId || 'ADMIN' })
      .select('ppl_id')
      .maybeSingle()
    if (error?.code === '23505') return nameDup()
    if (error) return dbFail(error)
    return NextResponse.json({ pplId: data?.ppl_id ?? null })
  }),
)
