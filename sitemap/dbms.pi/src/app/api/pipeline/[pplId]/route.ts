// 파이프라인 정의 단건 — GET ?link= (편집용, def_json 포함) · PUT { link, ... } (수정) · DELETE ?link= (논리삭제, 물리 DELETE 금지)
//  연결 소유 확인 = requireLink + 조건(lnk_id) — 남의·없는 정의 = 404
import { NextResponse, type NextRequest } from 'next/server'
import { withGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, parseBody } from '@/lib/api'
import { requireLink, type LinkCtx } from '@/lib/link/client'
import { ONE_COLS, PplInput, nameDup, toRow } from '@/lib/pipeline/input'

type Ctx = { params: Promise<{ pplId: string }> }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 경로 pplId 형식 + link 소유 확인 — params 는 즉시 해소되는 Promise 라 직렬이어도 왕복 없음
async function gate(req: NextRequest, ctx: unknown, linkId: string): Promise<{ link: LinkCtx; pplId: string } | NextResponse> {
  const { pplId } = await (ctx as Ctx).params
  if (!UUID_RE.test(pplId) || !linkId) return apiError('INVALID_INPUT', 400)
  const link = await requireLink(req, linkId, 'LAKE')
  if (link instanceof Response) return link as NextResponse
  return { link, pplId }
}

export const GET = withGuard(
  dbRoute(async (req, ctx) => {
    const g = await gate(req, ctx, req.nextUrl.searchParams.get('link') ?? '')
    if (g instanceof NextResponse) return g
    const { data, error } = await db()
      .from('dbm_ppl')
      .select(ONE_COLS)
      .eq('ppl_id', g.pplId)
      .eq('lnk_id', g.link.linkId)
      .eq('del_yn', 'N')
      .maybeSingle()
    if (error) return dbFail(error)
    if (!data) return apiError('NOT_FOUND', 404)
    return NextResponse.json({ item: data })
  }),
)

export const PUT = withGuard(
  dbRoute(async (req, ctx) => {
    const body = await parseBody(req, PplInput)
    if (body instanceof NextResponse) return body
    const g = await gate(req, ctx, body.link)
    if (g instanceof NextResponse) return g
    const { data, error } = await db()
      .from('dbm_ppl')
      .update(toRow(body, g.link.usrId || 'ADMIN'))
      .eq('ppl_id', g.pplId)
      .eq('lnk_id', g.link.linkId)
      .eq('del_yn', 'N')
      .select('ppl_id')
    if (error?.code === '23505') return nameDup()
    if (error) return dbFail(error)
    if (!data?.length) return apiError('NOT_FOUND', 404)
    return NextResponse.json({ pplId: g.pplId })
  }),
)

export const DELETE = withGuard(
  dbRoute(async (req, ctx) => {
    const g = await gate(req, ctx, req.nextUrl.searchParams.get('link') ?? '')
    if (g instanceof NextResponse) return g
    const now = new Date().toISOString()
    const { data, error } = await db()
      .from('dbm_ppl')
      .update({ del_yn: 'Y', del_dtm: now, modr_id: g.link.usrId || 'ADMIN', mod_dtm: now })
      .eq('ppl_id', g.pplId)
      .eq('lnk_id', g.link.linkId)
      .eq('del_yn', 'N')
      .select('ppl_id')
    if (error) return dbFail(error)
    if (!data?.length) return apiError('NOT_FOUND', 404)
    return NextResponse.json({ ok: true })
  }),
)
