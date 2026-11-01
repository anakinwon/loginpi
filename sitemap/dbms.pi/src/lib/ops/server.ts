// DB 운영 안전 서버 공용 — 연결·접속 파라미터 검증(소유자 확인), LinkError → { error, code } 응답, 조회 결과(cols/rows) → 객체
import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { LinkError, requireLink, type QueryResult } from '@/lib/link/client'

export type Obj = Record<string, unknown>

export const toObjs = (r: QueryResult): Obj[] =>
  r.rows.map((row) => Object.fromEntries(r.cols.map((c, i) => [c.toLowerCase(), row[i]])))

// 접속 정보 원문 노출 없이 code 만 — 문구는 화면 ops.err.<code> → link2.errors.<code>
export function linkFail(e: unknown) {
  if (e instanceof LinkError) {
    const status = e.status >= 400 && e.status < 600 ? e.status : 502
    return NextResponse.json({ error: e.code, code: e.code }, { status })
  }
  throw e
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function opsParams(req: NextRequest, linkId: unknown, connId: unknown): Promise<{ linkId: string; connId: string; usrId: string } | NextResponse> {
  if (typeof linkId !== 'string' || typeof connId !== 'string' || !UUID_RE.test(linkId) || !connId || connId.length > 100)
    return NextResponse.json({ error: 'INVALID_INPUT', code: 'INVALID_INPUT' }, { status: 400 })
  try {
    const ctx = await requireLink(req, linkId)
    if (!(ctx instanceof Response)) return { linkId, connId, usrId: ctx.usrId }
    return ctx instanceof NextResponse ? ctx : new NextResponse(ctx.body, ctx)
  } catch (e) {
    return linkFail(e)
  }
}
