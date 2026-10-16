// 일괄등록 API — POST { mode: check | apply, start_row, header, rows(최대 1,000) } : 일괄등록 권한(DA·STD), 반영 행은 승인대기(승인 화면에서 묶음 승인)
// check = 행 단위 판정만, apply = 같은 판정 후 OK·NSTD 행을 DB 함수(fn_bulk_req_std, 승인대기)로 한 트랜잭션 반영. 설계 docs/design/bulk-import.md
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { apiError, dbError, errMsg, parseBody, requireAreaRole } from '@/lib/api'
import { BATCH_SIZE, BULK_KINDS, mapHeader, type BulkKind } from '@/lib/bulk'
import { checkBulk } from '@/lib/bulk-check'

type Ctx = { params: Promise<{ areaId: string; kind: string }> }
// 일괄등록 행은 승인대기로 저장하고 행마다 등록 요청 생성(sql/012 fn_bulk_req_std, 2026-10-15 결정)
const TP: Record<BulkKind, string> = { words: 'DIC', domains: 'DOM', terms: 'TERM' }
const cell = z.string().max(5000)
const bodySchema = z.object({
  mode: z.enum(['check', 'apply']),
  start_row: z.number().int().min(2),
  header: z.array(cell).min(1).max(50),
  rows: z.array(z.array(cell).max(50)).min(1).max(BATCH_SIZE),
})

export async function POST(req: Request, { params }: Ctx) {
  const { areaId, kind } = await params
  if (!(BULK_KINDS as readonly string[]).includes(kind)) return apiError('NOT_FOUND', 404)
  const auth = await requireAreaRole(areaId, 'BULK')
  if (auth instanceof NextResponse) return auth
  const body = await parseBody(req, bodySchema)
  if (body instanceof NextResponse) return body
  const k = kind as BulkKind

  const h = mapHeader(k, body.header)
  if ('missing' in h) return NextResponse.json({ ok: false, code: 'HEADER_MISSING', message: `${errMsg('HEADER_MISSING')} : ${h.missing.join(', ')}` }, { status: 400 })

  try {
    const { results, rows } = await checkBulk(k, areaId, h.idx, body.rows, body.start_row)
    if (body.mode === 'check' || rows.length === 0) return NextResponse.json({ ok: true, results, applied: 0 })

    const { data, error } = await db().rpc('fn_bulk_req_std', { p_tp: TP[k], p_area_id: areaId, p_rows: rows, p_usr_id: auth.user.usr_id })
    if (error) return dbError(error)
    // 판정 뒤 다른 요청이 같은 이름을 먼저 저장한 행은 건너뜀으로 보고
    const done = new Set<number>(data as number[])
    for (const r of results)
      if ((r.status === 'OK' || r.status === 'NSTD') && !done.has(r.row_no)) Object.assign(r, { status: 'SKIP', code: 'CONFLICT_SKIP', detail: errMsg('CONFLICT_SKIP') })
    return NextResponse.json({ ok: true, results, applied: done.size })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
