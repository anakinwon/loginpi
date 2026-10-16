// 승인 요청 묶음 처리 — POST { action: 'APV' | 'RJCT', ids(최대 1,000), opinion? / reason } : 승인권자 전용, 행마다 재검증 후 처리하고 결과를 건별 보고
// 일괄등록 승인대기 행을 한 번에 승인할 때 사용. 순서대로 처리(단어 → 도메인 → 용어 의존이 있으므로 화면은 유형별로 보냄)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dbError, errMsg, parseBody, requireAreaRole } from '@/lib/api'
import { approveReq, rejectReq } from '@/lib/approval'

type Ctx = { params: Promise<{ areaId: string }> }
const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('APV'), ids: z.array(z.string().uuid()).min(1).max(1000), opinion: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal('RJCT'), ids: z.array(z.string().uuid()).min(1).max(1000), reason: z.string().trim().min(1).max(2000) }),
])

export async function POST(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'APPROVE')
  if (auth instanceof NextResponse) return auth
  const body = await parseBody(req, bodySchema)
  if (body instanceof NextResponse) return body
  const uid = auth.user.usr_id
  try {
    const results: { id: string; ok: boolean; code?: string; message?: string }[] = []
    for (const id of new Set(body.ids)) {
      const r = body.action === 'APV' ? await approveReq(areaId, id, uid, body.opinion) : await rejectReq(areaId, id, uid, body.reason)
      results.push(typeof r === 'string' ? { id, ok: false, code: r, message: errMsg(r) } : { id, ok: true })
    }
    return NextResponse.json({ ok: true, done: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
