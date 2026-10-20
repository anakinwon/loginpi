// 일괄등록 API — POST { mode: check | apply, start_row, header, rows(최대 1,000) } : 일괄등록 권한(roles.ts 권한표), 반영 행은 승인대기(승인 화면에서 묶음 승인)
// codes(표준코드 = 공통코드, 2026-10-20) : 없는 코드기본은 승인대기 등록 신청(sql/061 fn_cd_req, 자기 승인 없음), 코드상세는 그 아래 바로 반영(승인 대상 아님)
// forbidden(금칙어·이음동의어, 2026-10-18)은 승인 대상이 아니라(P05) std_dic_rel 에 바로 넣고 단어별 감사 이력을 남긴다
// check = 행 단위 판정만, apply = 같은 판정 후 OK·NSTD 행을 DB 함수(fn_bulk_req_std, 승인대기)로 한 트랜잭션 반영. 설계 docs/design/bulk-import.md
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { apiError, audit, dbError, errMsg, parseBody, requireAreaRole, type ErrorCode } from '@/lib/api'
import { BATCH_SIZE, BULK_KINDS, mapHeader, type BulkKind } from '@/lib/bulk'
import { checkBulk } from '@/lib/bulk-check'
import { reqBas, upsertDtl } from '@/lib/std-code'

type Ctx = { params: Promise<{ areaId: string; kind: string }> }
// 일괄등록 행은 승인대기로 저장하고 행마다 등록 요청 생성(sql/012 fn_bulk_req_std, 2026-10-15 결정)
const TP: Record<Exclude<BulkKind, 'forbidden' | 'codes'>, string> = { words: 'DIC', domains: 'DOM', terms: 'TERM' }
type Row = Record<string, unknown>

// 표준코드(공통코드, 2026-10-20) 반영 — 없는 코드기본은 등록 신청(승인대기, 사유 '일괄등록', 단어 일괄등록과 같이 자기 승인 없음 · 감사 이력 = DB 함수),
//  코드상세는 upsertDtl 로 바로 반영(논리 삭제된 같은 키는 되살림). 판정 뒤 다른 요청이 같은 코드기본·코드값을 먼저 넣었으면 그 행만 건너뜀. 코드상세 감사 이력 = 코드기본마다 1건(추가한 목록)
//  코드상세가 규칙에 막힌 행(구분코드 4번째 CD_DIV_TOO_MANY 등)은 why 에 사유 코드를 남겨 결과에 그 사유로 보고(2026-10-20 — 이전엔 사유 없이 건너뜀)
async function applyCodes(areaId: string, rows: Row[], uid: string, why: Map<number, ErrorCode>): Promise<Set<number>> {
  const cdOf = new Map<string, string>()
  for (const r of rows) if (r.cd_id) cdOf.set(r.term_id as string, r.cd_id as string)
  for (const r of rows) {
    const term = r.term_id as string
    if (cdOf.has(term)) continue
    const cd = r.new_cd_id as string
    const b = await reqBas(areaId, 'INS', cd, null, { term_id: term, cd_cls_nm: r.cd_cls_nm }, uid, '일괄등록')
    if ('apv_req_id' in b) cdOf.set(term, cd)
    else if (b.code === 'CD_DUP_TERM') {
      const got = await db().from('std_cd_bas').select('cd_id').eq('area_id', areaId).eq('term_id', term).eq('del_yn', 'N').maybeSingle()
      if (got.error) throw got.error
      if (got.data) cdOf.set(term, got.data.cd_id)
    }
  }
  const done = new Set<number>()
  const byCd = new Map<string, { cd_val: unknown; cd_val_nm: unknown }[]>()
  for (const r of rows) {
    const cd = cdOf.get(r.term_id as string)
    if (!cd) continue
    const v = { cd_val: r.cd_val, cd_val_nm: r.cd_val_nm, cd_val_desc: r.cd_val_desc, sort_seq: r.sort_seq, use_yn: r.use_yn }
    const d = await upsertDtl(areaId, cd, v, uid, (r.data_len as number | null) ?? null, false)
    if (!('row' in d)) {
      why.set(r.row_no as number, d.code)
      continue
    }
    done.add(r.row_no as number)
    byCd.set(cd, [...(byCd.get(cd) ?? []), { cd_val: r.cd_val, cd_val_nm: r.cd_val_nm }])
  }
  for (const [cd, add] of byCd) await audit({ area_id: areaId, tgt_tp_cd: 'CD', tgt_id: cd, act_cd: 'UPD', aftr_val: { val_add: add, bulk: true }, usr_id: uid })
  return done
}
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
    const why = new Map<number, ErrorCode>()
    if (k === 'forbidden') done = await applyAliases(areaId, rows, auth.user.usr_id)
    else if (k === 'codes') done = await applyCodes(areaId, rows, auth.user.usr_id, why)
    else {
      const { data, error } = await db().rpc('fn_bulk_req_std', { p_tp: TP[k], p_area_id: areaId, p_rows: rows, p_usr_id: auth.user.usr_id })
      if (error) return dbError(error)
      done = new Set<number>(data as number[])
    }
    // 판정 뒤 다른 요청이 같은 이름을 먼저 저장한 행은 건너뜀으로 보고
    for (const r of results)
      if ((r.status === 'OK' || r.status === 'NSTD') && !done.has(r.row_no)) {
        const c = why.get(r.row_no)
        Object.assign(r, c ? { status: 'ERR', code: c, detail: errMsg(c) } : { status: 'SKIP', code: 'CONFLICT_SKIP', detail: errMsg('CONFLICT_SKIP') })
      }
    return NextResponse.json({ ok: true, results, applied: done.size })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
