// 로컬 에이전트 실행 결과 보고(2026-10-18) — POST(Bearer) {run_nonce, try_no, results[], final} : 문장별 결과 기록·점유 연장, final 이면 DONE·PART·FAIL 확정
// 소유(에이전트·분류체계·접속)·실행중·일회값·시도 번호·점유 유효 중 하나라도 어긋나면 404(존재 여부를 알리지 않음)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, audit, dbError, parseBody } from '@/lib/api'
import { agtByToken, reportJob } from '@/lib/model-agent'

type Ctx = { params: Promise<{ reqId: string }> }
const body = z.object({
  run_nonce: z.string().regex(/^[0-9a-f]{32}$/),
  try_no: z.number().int().min(1),
  results: z
    .array(z.object({ seq: z.number().int().min(1), rslt: z.enum(['OK', 'ERR', 'SKIP', 'RBK']), err_cd: z.string().max(100).nullish(), err_msg: z.string().max(2000).nullish(), ms: z.number().int().min(0).nullish() }))
    .max(5000),
  final: z.enum(['DONE', 'FAIL', 'PART']).nullable(),
})

export async function POST(req: Request, { params }: Ctx) {
  const { reqId } = await params
  try {
    const g = await agtByToken(req.headers.get('authorization'))
    if (!g) return apiError('AGT_UNAUTH', 401)
    if (!z.string().uuid().safeParse(reqId).success) return apiError('NOT_FOUND', 404)
    const b = await parseBody(req, body)
    if (b instanceof NextResponse) return b
    const r = await reportJob(g, reqId, b)
    if (!r) return apiError('NOT_FOUND', 404)
    if (b.final && r.apv_usr_id) {
      const cnt = (k: string) => b.results.filter((x) => x.rslt === k).length
      await audit({ area_id: g.area_id, tgt_tp_cd: 'DDL', tgt_id: reqId, act_cd: 'UPD', aftr_val: { act: 'agent_result', req_sts_cd: r.req_sts_cd, try_no: b.try_no, ok: cnt('OK'), err: cnt('ERR'), rbk: cnt('RBK'), skip: cnt('SKIP'), agt_id: g.agt_id }, usr_id: r.apv_usr_id ?? '' })
    }
    return NextResponse.json({ ok: true, ...r }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
