// 일괄등록 API — POST { mode: check | apply, start_row, header, rows(최대 1,000) } : 일괄등록 권한(roles.ts 권한표), 반영 행은 승인대기(승인 화면에서 묶음 승인)
// forbidden(금칙어·이음동의어, 2026-10-18)은 승인 대상이 아니라(P05) std_dic_rel 에 바로 넣고 단어별 감사 이력을 남긴다
// check = 행 단위 판정만, apply = 같은 판정 후 OK·NSTD 행을 DB 함수(fn_bulk_req_std, 승인대기)로 한 트랜잭션 반영. 설계 docs/design/bulk-import.md
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { apiError, audit, dbError, errMsg, parseBody, requireAreaRole } from '@/lib/api'
import { BATCH_SIZE, BULK_KINDS, mapHeader, type BulkKind } from '@/lib/bulk'
import { checkBulk } from '@/lib/bulk-check'

type Ctx = { params: Promise<{ areaId: string; kind: string }> }
// 일괄등록 행은 승인대기로 저장하고 행마다 등록 요청 생성(sql/012 fn_bulk_req_std, 2026-10-15 결정)
const TP: Record<Exclude<BulkKind, 'forbidden'>, string> = { words: 'DIC', domains: 'DOM', terms: 'TERM' }
type Row = Record<string, unknown>

// 금칙어·이음동의어 반영 — 한 번에 넣고, 판정 뒤 다른 요청이 같은 표기를 먼저 넣어 트리거(23505)가 막으면 행별로 다시 넣어 그 행만 건너뜀
async function applyAliases(areaId: string, rows: Row[], uid: string): Promise<Set<number>> {
  const rec = (r: Row) => ({ dic_id: r.dic_id, rel_tp_cd: r.rel_tp_cd, rel_txt: r.rel_txt, regr_id: uid, modr_id: uid })
  const done = new Set<number>()
  const all = await db().from('std_dic_rel').insert(rows.map(rec))
  if (!all.error) rows.forEach((r) => done.add(r.row_no as number))
  else if (all.error.code !== '23505') throw all.error
  else
    for (const r of rows) {
      const one = await db().from('std_dic_rel').insert(rec(r))
      if (!one.error) done.add(r.row_no as number)
      else if (one.error.code !== '23505') throw one.error
    }
  const byDic = new Map<string, { rel_tp_cd: unknown; rel_txt: unknown }[]>()
  for (const r of rows) if (done.has(r.row_no as number)) byDic.set(r.dic_id as string, [...(byDic.get(r.dic_id as string) ?? []), { rel_tp_cd: r.rel_tp_cd, rel_txt: r.rel_txt }])
  for (const [dic, add] of byDic) await audit({ area_id: areaId, tgt_tp_cd: 'DIC', tgt_id: dic, act_cd: 'UPD', aftr_val: { alias_add: add, bulk: true }, usr_id: uid })
  return done
}
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
  const auth = await requireAreaRole(areaId, kind === 'forbidden' ? 'BAN_EDIT' : 'BULK') // 금칙어 = 설정 › 금칙어 일괄등록(표준담당자 요금제+)
  if (auth instanceof NextResponse) return auth
  const body = await parseBody(req, bodySchema)
  if (body instanceof NextResponse) return body
  const k = kind as BulkKind

  const h = mapHeader(k, body.header)
  if ('missing' in h) return NextResponse.json({ ok: false, code: 'HEADER_MISSING', message: `${errMsg('HEADER_MISSING')} : ${h.missing.join(', ')}` }, { status: 400 })

  try {
    const { results, rows } = await checkBulk(k, areaId, h.idx, body.rows, body.start_row)
    if (body.mode === 'check' || rows.length === 0) return NextResponse.json({ ok: true, results, applied: 0 })

    let done: Set<number>
    if (k === 'forbidden') done = await applyAliases(areaId, rows, auth.user.usr_id)
    else {
      const { data, error } = await db().rpc('fn_bulk_req_std', { p_tp: TP[k], p_area_id: areaId, p_rows: rows, p_usr_id: auth.user.usr_id })
      if (error) return dbError(error)
      done = new Set<number>(data as number[])
    }
    // 판정 뒤 다른 요청이 같은 이름을 먼저 저장한 행은 건너뜀으로 보고
    for (const r of results)
      if ((r.status === 'OK' || r.status === 'NSTD') && !done.has(r.row_no)) Object.assign(r, { status: 'SKIP', code: 'CONFLICT_SKIP', detail: errMsg('CONFLICT_SKIP') })
    return NextResponse.json({ ok: true, results, applied: done.size })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
