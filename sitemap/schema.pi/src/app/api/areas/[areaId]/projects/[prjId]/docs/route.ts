// 논리 모델 정의서(PRD_PiErd S1 L6) — GET ?format=csv&type=ent|attr|rel : 정의서 1종 CSV(엑셀 한글), ?format=html : 3종 인쇄용 HTML(브라우저 인쇄 = PDF). 조회 권한, 저장 없음
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, dbError, requireAreaRole } from '@/lib/api'
import { kstDtm } from '@/lib/bulk'
import { loadLogical } from '@/lib/model-logical'
import { DOC_TYPES, docCsv, docHtml, docTables, type DocType } from '@/lib/modelpi/docs'

type Ctx = { params: Promise<{ areaId: string; prjId: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'MODEL_VIEW')
  if (auth instanceof NextResponse) return auth
  if (!z.string().uuid().safeParse(prjId).success) return apiError('INVALID_INPUT', 400)
  const sp = new URL(req.url).searchParams
  const format = sp.get('format') === 'html' ? 'html' : 'csv'
  const type = sp.get('type') as DocType | null
  if (format === 'csv' && (!type || !(type in DOC_TYPES))) return apiError('INVALID_INPUT', 400)
  try {
    const m = await loadLogical(areaId, prjId)
    if (!m) return apiError('NOT_FOUND', 404)
    const prjNm = (m.prj as { prj_nm: string }).prj_nm
    const t = docTables(m.ents, m.rels)
    const at = kstDtm(new Date().toISOString())
    if (format === 'html')
      return new NextResponse(docHtml(prjNm, at, [t.ent, t.attr, t.rel], m.capped), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
    const name = encodeURIComponent(`${prjNm}_${DOC_TYPES[type!]}_${at.slice(0, 10)}.csv`)
    return new NextResponse(docCsv(t[type!]), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename*=UTF-8''${name}`, 'Cache-Control': 'no-store', ...(m.capped ? { 'X-Doc-Capped': '1' } : {}) } })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
