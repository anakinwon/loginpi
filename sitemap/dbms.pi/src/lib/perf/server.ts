// 성능 관측 서버 공용 — 이름 붙인 조회 결과(cols/rows) → 객체 변환(칼럼명 별칭 허용), LinkError → JSON 응답, 연결·접속 파라미터·최근 수집 조회
//  이름 붙인 조회의 칼럼명은 schema.pi queries.ts 정본 — PG 뷰 원래 이름과 축약형을 모두 받는다
import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { db, dbFail } from '@/lib/api'
import { LinkError, requireLink, type LinkCtx, type QueryResult } from '@/lib/link/client'

export type Obj = Record<string, unknown>

export function toObjs(r: QueryResult): Obj[] {
  return r.rows.map((row) => Object.fromEntries(r.cols.map((c, i) => [c.toLowerCase(), row[i]])))
}

// 별칭 중 처음 나온 값
export function pick(o: Obj, ...keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k]
  return null
}
export const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
export const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : num(v))
export const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v))

// LinkError(연결 클라이언트) → { error, code } — 접속 정보 원문 노출 없음(code 만, 문구는 화면 perf.err.<code>)
export function linkFail(e: unknown) {
  if (e instanceof LinkError) {
    const status = e.status >= 400 && e.status < 600 ? e.status : 502
    return NextResponse.json({ error: e.code, code: e.code }, { status })
  }
  throw e
}

// ?link=&conn= 검증 + 소유자 확인. 실패면 Response
export async function linkParams(req: NextRequest, linkId: string | null, connId: string | null): Promise<{ ctx: LinkCtx; linkId: string; connId: string } | NextResponse> {
  if (!linkId || !connId || !/^[0-9a-f-]{36}$/i.test(linkId) || connId.length > 100)
    return NextResponse.json({ error: 'INVALID_INPUT', code: 'INVALID_INPUT' }, { status: 400 })
  try {
    const ctx = await requireLink(req, linkId)
    if (!(ctx instanceof Response)) return { ctx, linkId, connId }
    return ctx instanceof NextResponse ? ctx : new NextResponse(ctx.body, ctx)
  } catch (e) {
    return linkFail(e)
  }
}

export type ClctRow = { clct_id: string; clct_dtm: string; stat_reset_dtm: string | null; pgss_yn: string; db_sz_byte: number | null }

// 최근 수집 n건(최신 먼저)
export async function latestClct(linkId: string, connId: string, n: number): Promise<ClctRow[] | NextResponse> {
  const { data, error } = await db()
    .from('dbm_prf_clct')
    .select('clct_id, clct_dtm, stat_reset_dtm, pgss_yn, db_sz_byte')
    .eq('lnk_id', linkId)
    .eq('conn_id', connId)
    .eq('del_yn', 'N')
    .order('clct_dtm', { ascending: false })
    .limit(n)
  return error ? dbFail(error) : (data as ClctRow[])
}
