// DDL 실행 요청 1건(2026-10-18) — GET : 상세(DDL 본문·문장별 결과) / PATCH {act} : approve(expect_hash, DA·자기 승인 금지)·reject(rjct_rsn, DA)·cancel(요청자)·retry(에이전트 재실행)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, audit, dbError, parseBody, requireAreaRole } from '@/lib/api'
import { approveReq, cancelReq, daCount, failRes, getReq, isFail, rejectReq, reqStmts, retryReq } from '@/lib/model-ddl-req'

type Ctx = { params: Promise<{ areaId: string; prjId: string; reqId: string }> }
const uuid = z.string().uuid()
const body = z.discriminatedUnion('act', [
  z.object({ act: z.literal('approve'), expect_hash: z.string().regex(/^[0-9a-f]{64}$/), self_rsn: z.string().trim().max(1000).optional() }), // self_rsn : DA 1명 분류체계 본인 승인 사유
  z.object({ act: z.literal('reject'), rjct_rsn: z.string().trim().min(1).max(1000) }),
  z.object({ act: z.literal('cancel') }),
  z.object({ act: z.literal('retry') }), // 에이전트 실패·일부 실행 → 다시 가져가게
])

export async function GET(_req: Request, { params }: Ctx) {
  const { areaId, prjId, reqId } = await params
  const auth = await requireAreaRole(areaId, 'MODEL_VIEW')
  if (auth instanceof NextResponse) return auth
  if (!uuid.safeParse(prjId).success || !uuid.safeParse(reqId).success) return apiError('INVALID_INPUT', 400)
  try {
    const q = await getReq(areaId, prjId, reqId, true)
    if (!q) return apiError('NOT_FOUND', 404)
    const { run_nonce: _n, ...item } = q
    const sole = q.sole_da_yn === 'Y' && (await daCount(areaId)) === 1 // 요청 때부터 단독 DA = 본인 승인 가능(사유 필수, sql/044)
    return NextResponse.json({ ok: true, item, stmts: await reqStmts(areaId, reqId), can_approve: auth.perms.includes('DDL_APPROVE') && (q.req_usr_id !== auth.user.usr_id || sole), self_approve: q.req_usr_id === auth.user.usr_id && sole && auth.perms.includes('DDL_APPROVE'), mine: q.req_usr_id === auth.user.usr_id })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { areaId, prjId, reqId } = await params
  if (!uuid.safeParse(prjId).success || !uuid.safeParse(reqId).success) return apiError('INVALID_INPUT', 400)
  const b = await parseBody(req, body) // 처리 종류에 따라 권한이 달라 본문 먼저
  if (b instanceof NextResponse) return b
  const auth = await requireAreaRole(areaId, b.act === 'cancel' || b.act === 'retry' ? 'MODEL_EDIT' : 'DDL_APPROVE')
  if (auth instanceof NextResponse) return auth
  try {
    const uid = auth.user.usr_id
    const r = b.act === 'approve' ? await approveReq(areaId, prjId, reqId, b.expect_hash, uid, b.self_rsn) : b.act === 'reject' ? await rejectReq(areaId, prjId, reqId, b.rjct_rsn, uid) : b.act === 'retry' ? await retryReq(areaId, prjId, reqId, uid, auth.perms.includes('DDL_APPROVE')) : await cancelReq(areaId, prjId, reqId, uid)
    if (isFail(r)) return failRes(r)
    await audit({ area_id: areaId, tgt_tp_cd: 'DDL', tgt_id: reqId, act_cd: 'UPD', aftr_val: { act: b.act, req_sts_cd: r.req_sts_cd, ...(b.act === 'reject' ? { rjct_rsn: b.rjct_rsn } : {}), ...(r.self_apv_rsn ? { self_approve: true, self_apv_rsn: r.self_apv_rsn } : {}) }, usr_id: uid })
    return NextResponse.json({ ok: true, item: r })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
