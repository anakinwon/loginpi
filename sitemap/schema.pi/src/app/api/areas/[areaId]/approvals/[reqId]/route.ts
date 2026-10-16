// 승인 요청 처리 — POST { action: 'APV', opinion? } | { action: 'RJCT', reason } | { action: 'CNCL' }
// 승인·반려 = 승인권자(DA·STD, 본인 신청 자기 승인 허용), 취소 = 신청자 본인. 승인 시점 재검증·원자 처리는 src/lib/approval.ts(sql/012)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, dbError, parseBody, requireAreaRole } from '@/lib/api'
import { approveReq, cancelReq, rejectReq } from '@/lib/approval'
import { ERR_STATUS } from '@/lib/change'
import { can } from '@/lib/roles'

type Ctx = { params: Promise<{ areaId: string; reqId: string }> }

const actSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('APV'), opinion: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal('RJCT'), reason: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal('CNCL') }),
])

export async function POST(req: Request, { params }: Ctx) {
  const { areaId, reqId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  const body = await parseBody(req, actSchema)
  if (body instanceof NextResponse) return body
  const uid = auth.user.usr_id
  if (body.action !== 'CNCL' && !can(auth.role, 'APPROVE')) return apiError('FORBIDDEN', 403)
  try {
    const r =
      body.action === 'APV' ? await approveReq(areaId, reqId, uid, body.opinion) : body.action === 'RJCT' ? await rejectReq(areaId, reqId, uid, body.reason) : await cancelReq(areaId, reqId, uid)
    if (typeof r === 'string') return apiError(r, r === 'FORBIDDEN' ? 403 : ERR_STATUS(r))
    return NextResponse.json({ ok: true, status: body.action })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
