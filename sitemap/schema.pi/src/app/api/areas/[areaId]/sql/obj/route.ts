// SQL 편집기 테이블 객체 편집기(2026-10-20) — GET ?conn=&schema=&rel=&sec=head|cols|…|count|ddl|data|erd[&page=&size=] : DBeaver Properties·Data·ER Diagram 섹션별 조회(권한 SQL_QUERY)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, dbError, requireAreaRole } from '@/lib/api'
import { getObj, OBJ_SECS } from '@/lib/sql-obj'

export const runtime = 'nodejs'
export const maxDuration = 30

type Ctx = { params: Promise<{ areaId: string }> }
const Q = z.object({
  conn: z.string().uuid(),
  schema: z.string().min(1).max(128),
  rel: z.string().min(1).max(128),
  sec: z.enum(OBJ_SECS),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  size: z.coerce.number().pipe(z.union([z.literal(50), z.literal(100), z.literal(200), z.literal(500)])).default(200), // DBeaver 기본 200행
})

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'SQL_QUERY')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const q = Q.safeParse({ conn: sp.get('conn'), schema: sp.get('schema'), rel: sp.get('rel'), sec: sp.get('sec'), page: sp.get('page') ?? undefined, size: sp.get('size') ?? undefined })
  if (!q.success) return apiError('INVALID_INPUT', 400)
  const { conn, ...o } = q.data
  try {
    return await getObj(areaId, conn, auth.perms, o)
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
