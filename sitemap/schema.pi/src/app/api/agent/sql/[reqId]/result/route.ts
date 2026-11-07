// 로컬 에이전트 SQL 편집기 결과 업로드(2026-11-07, sql/078) — POST(Bearer spa_) {run_nonce, final, err_cd, err_msg, results[]} : 문장 원문·종류는 받지 않음(서버가 지시서에서 재결합)
// 에이전트·분류체계·요청·실행중·일회값·점유 유효 중 하나라도 어긋나면 404(존재 비노출), 본문 4,000,000바이트 초과 = 대조 통과 시 FAIL(RSLT_SIZE) 후 413
// 크기 판정은 본문을 읽은 뒤(일회값이 본문에 있음 — Content-Length 만으로 413 을 주면 요청이 RUN 으로 남음), 본문 상한은 Vercel 함수 요청 4.5MB
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, dbError } from '@/lib/api'
import { agtByToken } from '@/lib/model-agent'
import { reportSql } from '@/lib/sql-agent'
import { RSLT_SIZE_ERR, rsltBody, tooBig } from '@/lib/sql-agent-core'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ reqId: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const { reqId } = await params
  try {
    const g = await agtByToken(req.headers.get('authorization'), req.headers.get('user-agent'))
    if (!g) return apiError('AGT_UNAUTH', 401)
    if (!z.string().uuid().safeParse(reqId).success) return apiError('NOT_FOUND', 404)
    const txt = await req.text()
    const size = Buffer.byteLength(txt)
    let raw: unknown
    try {
      raw = JSON.parse(txt)
    } catch {
      return apiError(tooBig(size) ? 'SQL_AGT_RSLT_SIZE' : 'INVALID_INPUT', tooBig(size) ? 413 : 400) // 일회값을 못 읽으면 대조 불가 — 아무것도 바꾸지 않음
    }
    if (tooBig(size)) {
      // 대조(토큰 귀속·요청·RUN·일회값·점유)가 통과할 때만 FAIL — 실패면 404 로 아무것도 바꾸지 않음(남의 요청을 실패시키지 못하게)
      const n = z.object({ run_nonce: rsltBody.shape.run_nonce }).safeParse(raw)
      if (!n.success) return apiError('NOT_FOUND', 404)
      return (await reportSql(g, reqId, { run_nonce: n.data.run_nonce, final: 'FAIL', err_cd: RSLT_SIZE_ERR, err_msg: `결과 ${size}바이트 > 상한` }, null)) ? apiError('SQL_AGT_RSLT_SIZE', 413) : apiError('NOT_FOUND', 404)
    }
    const b = rsltBody.safeParse(raw)
    if (!b.success) return apiError('INVALID_INPUT', 400)
    return (await reportSql(g, reqId, b.data, size)) ? NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } }) : apiError('NOT_FOUND', 404)
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
