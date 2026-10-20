// 표준코드(공통코드, P04, sql/060) — 코드기본 std_cd_bas PK = 분류체계 + 코드ID(코드 영문 표준용어 = 용어 물리명, 마스터 지시 2026-10-20),
//  코드상세 std_cd_dtl PK = 분류체계 + 코드ID + 코드값(1 : N). 코드기본 = 코드형(CD) 도메인 확정 표준용어 중 ~구분코드·~종류코드·~유형코드만(std-code-rule.ts),
//  코드값 길이 ≤ 용어 도메인 길이, 코드 안 코드값명 유일. 조회 STD_VIEW, 쓰기 STD_REQ
//  승인 절차(sql/061, 마스터 확정 2026-10-20) : 코드기본만 승인 대상(등록·수정·삭제 = 신청 → 승인), 코드상세는 바로 반영(반려된 코드기본 아래는 등록 불가)
//  주식별자가 자연키라 논리 삭제된 같은 키를 다시 등록하면 그 행을 되살린다(새 행 불가)
import 'server-only'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from './db'
import { inChunks, pageRows } from './paging'
import { apiError, audit, dbError, parseBody, requireAreaRole, type ErrorCode } from './api'
import { approveReq, mapErr, reqOptShape } from './approval'
import { CD_KIND, CD_VAL_BAD, DIV_MAX, basChgPath, cdKind, valTooLong, type CdKind } from './std-code-rule'
import { cdTermCheck } from './std-code-term'

type Ctx = { params: Promise<Record<string, string>> }
type Row = Record<string, unknown>
const BAS_COLS = 'cd_id, term_id, cd_cls_nm, cd_desc, use_yn, std_sts_cd, ver_no, std_term(term_log_nm, term_phy_nm, std_dom(dom_nm, data_len))'
const DTL_COLS = 'cd_id, cd_val, cd_val_nm, cd_val_desc, sort_seq, use_yn, ver_no'
const txt = (n: number) => z.string().trim().max(n).nullable()
const yn = z.enum(['Y', 'N'])
const basSchema = z.object({ term_id: z.string().uuid(), cd_cls_nm: txt(200).optional(), cd_desc: txt(4000).optional(), use_yn: yn.optional(), ...reqOptShape }).strict()
const basEdit = z.object({ cd_cls_nm: txt(200).optional(), cd_desc: txt(4000).optional(), use_yn: yn.optional(), ver_no: z.coerce.number().int().positive(), ...reqOptShape }).strict()
const dtlShape = {
  cd_val: z.string().trim().min(1).max(100).refine((v) => !CD_VAL_BAD.test(v)), // % / \ ? # 불가
  cd_val_nm: z.string().trim().min(1).max(400),
  cd_val_desc: txt(4000).optional(),
  sort_seq: z.coerce.number().int().min(0).max(99999).optional(),
  use_yn: yn.optional(),
}
const dtlSchema = z.object(dtlShape).strict()
const dtlEdit = z.object(dtlShape).partial().extend({ ver_no: z.coerce.number().int().positive() }).strict()
type Bas = Row & { ver_no: number; std_term: { term_log_nm: string; std_dom: { data_len: number | null } | null } | null }
const nowIso = () => new Date().toISOString()
const CONFLICT = new Set<ErrorCode>(['VERSION_CONFLICT', 'CD_DUP_TERM', 'CD_VAL_DUP', 'CD_VAL_NM_DUP', 'CD_IN_USE', 'STS_NOT_EDITABLE', 'APV_WAIT_EXISTS', 'APV_NOT_WAITING'])
const status = (c: ErrorCode) => (c === 'NOT_FOUND' ? 404 : CONFLICT.has(c) ? 409 : 400)
const fail = (c: ErrorCode) => apiError(c, status(c))

// 활성 코드기본 — 없으면 null
export async function activeBas(areaId: string, cdId: string): Promise<Bas | null> {
  const { data, error } = await db().from('std_cd_bas').select(BAS_COLS).eq('area_id', areaId).eq('cd_id', cdId).eq('del_yn', 'N').maybeSingle()
  if (error) throw error
  return data as unknown as Bas | null
}

// 코드기본 승인 신청(fn_cd_req, sql/061) — INS = 승인대기 행 + 요청(일괄등록 공용), UPD·DEL = 요청만(기준 버전). 감사 이력은 DB 함수가 남김
export async function reqBas(areaId: string, act: 'INS' | 'UPD' | 'DEL', cdId: string, ver: number | null, row: Row, uid: string, rsn?: string | null): Promise<{ apv_req_id: string } | { code: ErrorCode }> {
  const { data, error } = await db().rpc('fn_cd_req', { p_area_id: areaId, p_act: act, p_cd_id: cdId, p_ver: ver, p_row: row, p_usr_id: uid, p_rsn: rsn || null })
  return error ? { code: mapErr(error, 'CD') } : { apv_req_id: data as string }
}

// 코드상세 등록·되살림(일괄등록 공용) — 같은 코드값 활성 = CD_VAL_DUP, 같은 코드값명 활성 = CD_VAL_NM_DUP, 구분코드 활성 DIV_MAX 초과 = CD_DIV_TOO_MANY, 논리 삭제된 같은 코드값 = 되살림
export async function upsertDtl(areaId: string, cdId: string, v: Row, uid: string, dataLen: number | null, audited = true): Promise<{ row: Row } | { code: ErrorCode }> {
  if (valTooLong(v.cd_val as string, dataLen)) return { code: 'CD_VAL_TOO_LONG' }
  const [cur, nm] = await Promise.all([
    db().from('std_cd_dtl').select('del_yn, ver_no').eq('area_id', areaId).eq('cd_id', cdId).eq('cd_val', v.cd_val as string).maybeSingle(),
    db().from('std_cd_dtl').select('cd_val').eq('area_id', areaId).eq('cd_id', cdId).eq('cd_val_nm', v.cd_val_nm as string).eq('del_yn', 'N').limit(1),
  ])
  if (cur.error) throw cur.error
  if (nm.error) throw nm.error
  if (cur.data?.del_yn === 'N') return { code: 'CD_VAL_DUP' }
  if (nm.data.length) return { code: 'CD_VAL_NM_DUP' }
  const bas = await activeBas(areaId, cdId)
  if (cdKind(bas?.std_term?.term_log_nm) === 'DIV') {
    const n = await db().from('std_cd_dtl').select('cd_val', { count: 'exact', head: true }).eq('area_id', areaId).eq('cd_id', cdId).eq('del_yn', 'N')
    if (n.error) throw n.error
    if ((n.count ?? 0) >= DIV_MAX) return { code: 'CD_DIV_TOO_MANY' }
  }
  const q = cur.data
    ? db().from('std_cd_dtl').update({ cd_val_desc: null, sort_seq: 0, use_yn: 'Y', ...v, del_yn: 'N', del_dtm: null, ver_no: cur.data.ver_no + 1, modr_id: uid }).eq('area_id', areaId).eq('cd_id', cdId).eq('cd_val', v.cd_val as string).eq('del_yn', 'Y')
    : db().from('std_cd_dtl').insert({ area_id: areaId, cd_id: cdId, ...v, regr_id: uid, modr_id: uid })
  const { data, error } = await q.select(DTL_COLS).single()
  if (error) {
    if (error.code === '23505' || error.code === 'PGRST116') return { code: 'CD_VAL_DUP' } // 동시 등록
    throw error
  }
  if (audited) await audit({ area_id: areaId, tgt_tp_cd: 'CD_VAL', tgt_id: `${cdId}|${v.cd_val}`, act_cd: 'INS', aftr_val: data, usr_id: uid })
  return { row: data as Row }
}

// 경로 값 풀기(코드값에 특수문자 가능 — 이미 풀린 값·잘못된 % 는 그대로)
const dec = (v: string) => {
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}
// 라우트 공용 : params 풀기 + 예외 = DB 오류 응답
const wrap = (fn: (p: Record<string, string>, req: Request) => Promise<NextResponse>) => async (req: Request, { params }: Ctx) => {
  try {
    const p = await params
    return await fn(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, dec(v)])), req)
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
// 바뀐 칸만(같은 값 제외)
const changed = (b: Row, cur: Row, skip: string[]) => Object.fromEntries(Object.entries(b).filter(([k, v]) => !skip.includes(k) && (v ?? null) !== (cur[k] ?? null)))

// ── 코드기본 ──
// 목록 = 페이지 단위(?page=&size=10|20|50|100), 검색 ?q=(코드명 또는 코드ID), 구분 ?kind=DIV|KND|TYP(이름 끝 3종), 상태 ?sts=REQ|CNFM|RJCT(std_sts_cd 기준) + 구분별 건수
//  행마다 pend_act = 처리 대기 중인 수정·삭제 요청 동작(UPD·DEL, 없으면 null)
const LIST_COLS = 'cd_id, term_id, cd_cls_nm, cd_desc, use_yn, std_sts_cd, ver_no, std_term!inner(term_log_nm, term_phy_nm, std_dom(dom_nm, data_len))'
const STS = ['REQ', 'CNFM', 'RJCT']
// 이 코드ID 들의 처리 대기 수정·삭제 요청(코드ID → 동작)
async function pendOf(areaId: string, cdIds: string[]): Promise<Map<string, string>> {
  const r = await inChunks(cdIds, (part) => db().from('std_apv_req').select('tgt_key_txt, act_cd').eq('area_id', areaId).eq('tgt_tp_cd', 'CD').eq('apv_sts_cd', 'REQ').in('act_cd', ['UPD', 'DEL']).eq('del_yn', 'N').in('tgt_key_txt', part))
  if (r.error) throw r.error
  return new Map(r.data.map((x) => [x.tgt_key_txt as string, x.act_cd as string]))
}
// 목록 칸 한 행(등록·수정 응답 item)
async function listItem(areaId: string, cdId: string): Promise<Row | null> {
  const { data, error } = await db().from('std_cd_bas').select(LIST_COLS).eq('area_id', areaId).eq('cd_id', cdId).eq('del_yn', 'N').maybeSingle()
  if (error) throw error
  if (!data) return null
  return { ...(data as unknown as Row), pend_act: (await pendOf(areaId, [cdId])).get(cdId) ?? null }
}

export const listBas = wrap(async ({ areaId }, req) => {
  const auth = await requireAreaRole(areaId, 'STD_VIEW')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  // 검색어 : PostgREST 구분자(, ( ))·% 는 지우고, 코드ID 의 _ 는 LIKE 와일드카드가 아니라 글자로(\_) — 예 ADDR_CLCD
  const raw = (sp.get('q') ?? '').trim().replace(/[%,()\\]/g, '')
  const byId = /^[A-Za-z0-9_]+$/.test(raw)
  const q = raw.replace(/_/g, '\\_')
  const kind = sp.get('kind') as CdKind | null
  const sts = STS.includes(sp.get('sts') ?? '') ? sp.get('sts') : null
  const base = (k: CdKind | null, head = false) => {
    let x = db().from('std_cd_bas').select(head ? 'cd_id, std_term!inner(term_log_nm)' : LIST_COLS, { count: 'exact', head }).eq('area_id', areaId).eq('del_yn', 'N')
    if (k && CD_KIND[k]) x = x.like('std_term.term_log_nm', `%${CD_KIND[k].nm}`)
    if (q) x = byId ? x.ilike('cd_id', `%${q}%`) : x.ilike('std_term.term_log_nm', `%${q}%`)
    if (sts) x = x.eq('std_sts_cd', sts)
    return x
  }
  const [r, ...cnts] = await Promise.all([pageRows(() => base(kind).order('cd_id'), sp, 1000), base(null, true), ...(Object.keys(CD_KIND) as CdKind[]).map((k) => base(k, true))])
  if (r.error) return dbError(r.error)
  for (const c of cnts) if (c.error) return dbError(c.error)
  const cnt = Object.fromEntries([['ALL', cnts[0].count ?? 0], ...(Object.keys(CD_KIND) as CdKind[]).map((k, i) => [k, cnts[i + 1].count ?? 0])])
  const rows = r.rows as Row[]
  const pend = await pendOf(areaId, rows.map((x) => x.cd_id as string))
  return NextResponse.json({ ok: true, items: rows.map((x) => ({ ...x, pend_act: pend.get(x.cd_id as string) ?? null })), total: r.total, page: r.page, size: r.size, cnt })
})

// 등록 = 승인 신청(승인대기 행 + 요청, 코드ID = 용어 물리명) → 202 requested. 즉시 승인(self_apv, SELF_APPROVE 권한만)이 성공하면 201
//  활성 같은 코드ID·같은 용어(승인대기·반려 행 포함) = CD_DUP_TERM(DB 유일 위반)
export const createBas = wrap(async ({ areaId }, req) => {
  const auth = await requireAreaRole(areaId, 'STD_REQ')
  if (auth instanceof NextResponse) return auth
  const b = await parseBody(req, basSchema)
  if (b instanceof NextResponse) return b
  const { term_id, self_apv, req_rsn, ...set } = b
  const t = await cdTermCheck(areaId, term_id)
  if (typeof t === 'string') return fail(t)
  const uid = auth.user.usr_id
  const r = await reqBas(areaId, 'INS', t.term_phy_nm, null, { term_id, ...set }, uid, req_rsn)
  if ('code' in r) return fail(r.code)
  // 즉시 승인이 실패하면 승인대기로 남김(승인 화면에서 처리)
  const ok = !!self_apv && auth.perms.includes('SELF_APPROVE') && typeof (await approveReq(areaId, r.apv_req_id, uid, '자기 승인(등록 즉시)')) !== 'string'
  const item = await listItem(areaId, t.term_phy_nm)
  return ok ? NextResponse.json({ ok: true, item }, { status: 201 }) : NextResponse.json({ ok: true, requested: true, apv_req_id: r.apv_req_id, item }, { status: 202 })
})

// 수정 — 승인대기 = 불가, 반려 = 재신청(fn_cd_resub, 바뀐 칸 반영) 202, 승인완료 = 수정 신청 202(처리 대기 요청 있으면 APV_WAIT_EXISTS) / 자기 승인 200
export const updateBas = wrap(async ({ areaId, cdId }, req) => {
  const auth = await requireAreaRole(areaId, 'STD_REQ')
  if (auth instanceof NextResponse) return auth
  const b = await parseBody(req, basEdit)
  if (b instanceof NextResponse) return b
  const cur = await activeBas(areaId, cdId)
  if (!cur) return fail('NOT_FOUND')
  if (cur.ver_no !== b.ver_no) return fail('VERSION_CONFLICT')
  const path = basChgPath(cur.std_sts_cd as string, 'UPD')
  if (path === 'LOCKED') return fail('STS_NOT_EDITABLE')
  const set = changed(b, cur, ['ver_no', 'self_apv', 'req_rsn'])
  if (!Object.keys(set).length) return fail('NO_CHANGE')
  const uid = auth.user.usr_id
  if (path === 'RESUB') {
    const { data, error } = await db().rpc('fn_cd_resub', { p_area_id: areaId, p_cd_id: cdId, p_ver: b.ver_no, p_row: set, p_usr_id: uid, p_rsn: b.req_rsn || null })
    if (error) return fail(mapErr(error, 'CD'))
    return NextResponse.json({ ok: true, requested: true, resubmitted: true, apv_req_id: data as string }, { status: 202 })
  }
  const r = await reqBas(areaId, 'UPD', cdId, b.ver_no, set, uid, b.req_rsn)
  if ('code' in r) return fail(r.code)
  if (!(b.self_apv && auth.perms.includes('SELF_APPROVE'))) return NextResponse.json({ ok: true, requested: true, apv_req_id: r.apv_req_id }, { status: 202 })
  const a = await approveReq(areaId, r.apv_req_id, uid, '자기 승인(즉시)')
  if (typeof a === 'string') return fail(a)
  return NextResponse.json({ ok: true, apv_req_id: r.apv_req_id, item: await listItem(areaId, cdId) })
})

// 삭제 ?ver_no=&self_apv=1&req_rsn= — 승인대기 = 불가(신청 취소는 승인 화면), 반려 = 바로 논리 삭제(코드상세 포함) 200,
//  승인완료 = 활성 코드상세 있으면 CD_IN_USE, 아니면 삭제 신청 202 / 자기 승인 200
export const deleteBas = wrap(async ({ areaId, cdId }, req) => {
  const auth = await requireAreaRole(areaId, 'STD_REQ')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const ver = Number(sp.get('ver_no'))
  const cur = await activeBas(areaId, cdId)
  if (!cur) return fail('NOT_FOUND')
  if (cur.ver_no !== ver) return fail('VERSION_CONFLICT')
  const path = basChgPath(cur.std_sts_cd as string, 'DEL')
  if (path === 'LOCKED') return fail('STS_NOT_EDITABLE')
  const uid = auth.user.usr_id
  if (path === 'DROP') {
    // 반려된 신청 행은 사용처가 없으므로 바로 논리 삭제(코드기본 감사 이력 = fn_cd_set), 그 아래 코드상세(승인대기 때 등록분)도 논리 삭제
    const { error } = await db().rpc('fn_cd_set', { p_area_id: areaId, p_cd_id: cdId, p_ver: ver, p_set: { del: 'Y' }, p_usr_id: uid, p_req_id: null, p_act: 'DEL' })
    if (error) return fail(mapErr(error, 'CD'))
    const d = await db().from('std_cd_dtl').update({ del_yn: 'Y', del_dtm: nowIso(), modr_id: uid }).eq('area_id', areaId).eq('cd_id', cdId).eq('del_yn', 'N')
    if (d.error) return dbError(d.error)
    return NextResponse.json({ ok: true })
  }
  const used = await db().from('std_cd_dtl').select('cd_val').eq('area_id', areaId).eq('cd_id', cdId).eq('del_yn', 'N').limit(1)
  if (used.error) return dbError(used.error)
  if (used.data.length) return fail('CD_IN_USE')
  const r = await reqBas(areaId, 'DEL', cdId, ver, {}, uid, sp.get('req_rsn')?.slice(0, 2000))
  if ('code' in r) return fail(r.code)
  if (sp.get('self_apv') !== '1' || !auth.perms.includes('SELF_APPROVE')) return NextResponse.json({ ok: true, requested: true, apv_req_id: r.apv_req_id }, { status: 202 })
  const a = await approveReq(areaId, r.apv_req_id, uid, '자기 승인(즉시)')
  if (typeof a === 'string') return fail(a)
  return NextResponse.json({ ok: true, apv_req_id: r.apv_req_id })
})

// ── 코드상세 ──
const activeDtl = async (areaId: string, cdId: string, val: string) => {
  const { data, error } = await db().from('std_cd_dtl').select(DTL_COLS).eq('area_id', areaId).eq('cd_id', cdId).eq('cd_val', val).eq('del_yn', 'N').maybeSingle()
  if (error) throw error
  return data as (Row & { ver_no: number }) | null
}

export const listDtl = wrap(async ({ areaId, cdId }) => {
  const auth = await requireAreaRole(areaId, 'STD_VIEW')
  if (auth instanceof NextResponse) return auth
  const { data, error } = await db().from('std_cd_dtl').select(DTL_COLS).eq('area_id', areaId).eq('cd_id', cdId).eq('del_yn', 'N').order('sort_seq').order('cd_val')
  if (error) return dbError(error)
  return NextResponse.json({ ok: true, items: data })
})

export const createDtl = wrap(async ({ areaId, cdId }, req) => {
  const auth = await requireAreaRole(areaId, 'STD_REQ')
  if (auth instanceof NextResponse) return auth
  const b = await parseBody(req, dtlSchema)
  if (b instanceof NextResponse) return b
  const bas = await activeBas(areaId, cdId)
  if (!bas) return fail('NOT_FOUND')
  if (bas.std_sts_cd === 'RJCT') return fail('CD_BAS_RJCT')
  const r = await upsertDtl(areaId, cdId, b, auth.user.usr_id, bas.std_term?.std_dom?.data_len ?? null)
  return 'code' in r ? fail(r.code) : NextResponse.json({ ok: true, item: r.row }, { status: 201 })
})

export const updateDtl = wrap(async ({ areaId, cdId, cdVal }, req) => {
  const auth = await requireAreaRole(areaId, 'STD_REQ')
  if (auth instanceof NextResponse) return auth
  const b = await parseBody(req, dtlEdit)
  if (b instanceof NextResponse) return b
  const cur = await activeDtl(areaId, cdId, cdVal)
  if (!cur) return fail('NOT_FOUND')
  if (cur.ver_no !== b.ver_no) return fail('VERSION_CONFLICT')
  if (b.cd_val !== undefined && b.cd_val !== cdVal) return fail('CD_VAL_KEY_FIXED') // 코드값 = 주식별자
  const set = changed(b, cur, ['ver_no', 'cd_val'])
  if (!Object.keys(set).length) return fail('NO_CHANGE')
  if (set.cd_val_nm) {
    const nm = await db().from('std_cd_dtl').select('cd_val').eq('area_id', areaId).eq('cd_id', cdId).eq('cd_val_nm', set.cd_val_nm as string).eq('del_yn', 'N').neq('cd_val', cdVal).limit(1)
    if (nm.error) return dbError(nm.error)
    if (nm.data.length) return fail('CD_VAL_NM_DUP')
  }
  const { data, error } = await db().from('std_cd_dtl').update({ ...set, ver_no: b.ver_no + 1, modr_id: auth.user.usr_id }).eq('area_id', areaId).eq('cd_id', cdId).eq('cd_val', cdVal).eq('ver_no', b.ver_no).eq('del_yn', 'N').select(DTL_COLS)
  if (error) return dbError(error, 'CD_VAL_NM_DUP')
  if (!data.length) return fail('VERSION_CONFLICT')
  await audit({ area_id: areaId, tgt_tp_cd: 'CD_VAL', tgt_id: `${cdId}|${cdVal}`, act_cd: 'UPD', bfr_val: cur, aftr_val: data[0], usr_id: auth.user.usr_id })
  return NextResponse.json({ ok: true, item: data[0] })
})

export const deleteDtl = wrap(async ({ areaId, cdId, cdVal }, req) => {
  const auth = await requireAreaRole(areaId, 'STD_REQ')
  if (auth instanceof NextResponse) return auth
  const ver = Number(new URL(req.url).searchParams.get('ver_no'))
  const cur = await activeDtl(areaId, cdId, cdVal)
  if (!cur) return fail('NOT_FOUND')
  if (cur.ver_no !== ver) return fail('VERSION_CONFLICT')
  const { data, error } = await db().from('std_cd_dtl').update({ del_yn: 'Y', del_dtm: nowIso(), ver_no: ver + 1, modr_id: auth.user.usr_id }).eq('area_id', areaId).eq('cd_id', cdId).eq('cd_val', cdVal).eq('ver_no', ver).eq('del_yn', 'N').select(DTL_COLS)
  if (error) return dbError(error)
  if (!data.length) return fail('VERSION_CONFLICT')
  await audit({ area_id: areaId, tgt_tp_cd: 'CD_VAL', tgt_id: `${cdId}|${cdVal}`, act_cd: 'DEL', bfr_val: cur, aftr_val: data[0], usr_id: auth.user.usr_id })
  return NextResponse.json({ ok: true })
})
