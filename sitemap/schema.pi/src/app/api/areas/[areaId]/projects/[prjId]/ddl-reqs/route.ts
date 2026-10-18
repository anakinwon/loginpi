// DDL 실행 요청(2026-10-18, sql/038) — GET ?page=&size= : 목록(DDL 본문 제외) / POST {phy_mdl_id, conn_id, tbl_ids} : 요청(REQUEST 권한)
// 서버가 buildDdl 로 DDL 을 만들어 스냅샷 저장 — 클라이언트 SQL 은 받지 않음. 차단 사유가 있으면 400 DDL_GATE(detail = 사유)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, audit, dbError, parseBody, requireAreaRole } from '@/lib/api'
import { createReq, failRes, isFail, listConns, listReqs } from '@/lib/model-ddl-req'

type Ctx = { params: Promise<{ areaId: string; prjId: string }> }
const uuid = z.string().uuid()
const body = z.object({ phy_mdl_id: uuid, conn_id: uuid, tbl_ids: z.array(uuid).min(1).max(2000) })

export async function GET(req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const page = Math.max(1, Number(sp.get('page')) || 1)
  const size = Math.min(50, Math.max(1, Number(sp.get('size')) || 10))
  if (!uuid.safeParse(prjId).success) return apiError('INVALID_INPUT', 400)
  try {
    const [r, cs] = await Promise.all([listReqs(areaId, prjId, page, size), listConns(areaId)])
    const cn = new Map(cs.map((c) => [c.conn_id, c.conn_nm]))
    return NextResponse.json({ ok: true, items: r.items.map((x) => ({ ...x, conn_nm: cn.get(x.conn_id) ?? '(삭제된 접속)', mine: x.req_usr_id === auth.user.usr_id })), total: r.total, me: auth.user.usr_id })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'REQUEST')
  if (auth instanceof NextResponse) return auth
  if (!uuid.safeParse(prjId).success) return apiError('INVALID_INPUT', 400)
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  try {
    const r = await createReq(areaId, prjId, { ...b, tbl_ids: [...new Set(b.tbl_ids)] }, auth.user.usr_id)
    if (isFail(r)) return failRes(r)
    await audit({ area_id: areaId, tgt_tp_cd: 'DDL', tgt_id: r.req_id, act_cd: 'INS', aftr_val: { conn_id: r.conn_id, ddl_hash: r.ddl_hash, stmt_cnt: r.stmt_cnt, tbl_cnt: r.tbl_ids.length }, usr_id: auth.user.usr_id })
    return NextResponse.json({ ok: true, item: r })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
