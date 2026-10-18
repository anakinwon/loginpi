// 로컬 에이전트 접속 시험 결과(2026-10-18, sql/041) — POST(Bearer) {req_dtm, ok, msg} : 그 에이전트 접속의 대기 중 시험만 기록, 아니면 404
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, dbError, parseBody } from '@/lib/api'
import { agtByToken, reportTest } from '@/lib/model-agent'

type Ctx = { params: Promise<{ connId: string }> }
const body = z.object({ req_dtm: z.string().min(10).max(40), ok: z.boolean(), msg: z.string().max(2000).nullish() })

export async function POST(req: Request, { params }: Ctx) {
  const { connId } = await params
  try {
    const g = await agtByToken(req.headers.get('authorization'))
    if (!g) return apiError('AGT_UNAUTH', 401)
    if (!z.string().uuid().safeParse(connId).success) return apiError('NOT_FOUND', 404)
    const b = await parseBody(req, body)
    if (b instanceof NextResponse) return b
    return (await reportTest(g, connId, b)) ? NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } }) : apiError('NOT_FOUND', 404)
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
