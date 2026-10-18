// DDL 생성(마스터 지시 2026-10-18) — GET(mdl 없음) : 물리 모델 목록 / GET ?mdl= : 주제영역(ERD 작성완료 여부)·테이블 목록(선택 가능·사유), 조회 권한
// POST {phy_mdl_id, tbl_ids} : 선택 테이블 DDL 미리보기(문장 수·해시·차단 사유) — 테이블 ID 가 많아 URL 대신 본문, 조회 권한(생성만, DB 실행 없음)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, dbError, parseBody, requireAreaRole } from '@/lib/api'
import { buildDdl, ddlTargets } from '@/lib/model-ddl'
import { listPhy } from '@/lib/model-phy'

type Ctx = { params: Promise<{ areaId: string; prjId: string }> }
const uuid = z.string().uuid()
const body = z.object({ phy_mdl_id: uuid, tbl_ids: z.array(uuid).min(1).max(2000) })

export async function GET(req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  const mdl = new URL(req.url).searchParams.get('mdl') ?? ''
  if (!uuid.safeParse(prjId).success || (mdl && !uuid.safeParse(mdl).success)) return apiError('INVALID_INPUT', 400)
  try {
    if (!mdl) return NextResponse.json({ ok: true, models: await listPhy(areaId, prjId) })
    const t = await ddlTargets(areaId, prjId, mdl)
    if (!t) return apiError('NOT_FOUND', 404)
    return NextResponse.json({ ok: true, mdl: t.mdl, subjs: t.subjs, tables: t.tables })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  if (!uuid.safeParse(prjId).success) return apiError('INVALID_INPUT', 400)
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  try {
    const r = await buildDdl(areaId, prjId, b.phy_mdl_id, [...new Set(b.tbl_ids)])
    return r ? NextResponse.json({ ok: true, ...r, stmt_cnt: r.stmts.length, stmts: undefined }) : apiError('NOT_FOUND', 404)
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
