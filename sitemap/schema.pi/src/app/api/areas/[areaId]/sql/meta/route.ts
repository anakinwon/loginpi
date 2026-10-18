// SQL 편집기 메타데이터(2026-10-18) — GET ?conn=&node=schemas|objects|columns|completion&schema=&rel= : 탐색기 트리·자동 완성(조회 권한 SQL_QUERY)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, dbError, requireAreaRole } from '@/lib/api'
import { getMeta } from '@/lib/sql-meta'

export const runtime = 'nodejs'
export const maxDuration = 30

type Ctx = { params: Promise<{ areaId: string }> }
const Q = z.object({
  conn: z.string().uuid(),
  node: z.enum(['schemas', 'objects', 'columns', 'completion']),
  schema: z.string().min(1).max(128).nullable(),
  rel: z.string().min(1).max(128).nullable(),
})

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'SQL_QUERY')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const q = Q.safeParse({ conn: sp.get('conn'), node: sp.get('node'), schema: sp.get('schema'), rel: sp.get('rel') })
  if (!q.success || (q.data.node !== 'schemas' && !q.data.schema) || (q.data.node === 'columns' && !q.data.rel)) return apiError('INVALID_INPUT', 400)
  try {
    return await getMeta(areaId, q.data.conn, auth.role, q.data.node, q.data.schema, q.data.rel)
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
