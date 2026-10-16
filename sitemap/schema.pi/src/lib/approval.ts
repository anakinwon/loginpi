// 승인 절차 공용(sql/012) — 등록 신청·승인·반려·취소·재신청. 등록·수정·삭제 라우트, 승인 라우트, 일괄 승인 라우트가 같은 함수를 쓴다
// 승인 시점 재검증 : 등록 신청은 사용 규칙(용어 구성 단어·도메인 승인완료, 대표도메인명 단어), 수정·삭제는 prepareChange(이름 재생성·사용 중·기준 버전)
import { z } from 'zod'
import { db } from './db'
import { dupCodeOf, type ErrorCode } from './api'
import { can, STS_NM, type MbrRole } from './roles'
import { domKeyWordError } from './domain'
import { termDomError, wordsByIds } from './term'
import { termRuleError } from './term-split'
import { prepareChange, type ChgTp } from './change'

export type ApvTp = ChgTp
type Err = { code?: string; message?: string }
const DUP: Record<ApvTp, ErrorCode> = { DIC: 'WORD_DUP_LOGICAL', DOM: 'DOM_DUP_NM', TERM: 'TERM_DUP_NM' }

// DB 오류 → 업무 오류 코드(알 수 없으면 throw)
function mapErr(e: Err, tp?: ApvTp): ErrorCode {
  if (e.code === 'P0002') return 'APV_NOT_WAITING'
  if (e.code === '40001') return 'VERSION_CONFLICT'
  if (e.code === '23505') return dupCodeOf(e.message, tp ? DUP[tp] : 'APV_WAIT_EXISTS')
  throw e
}

// 등록 신청 승인 전 재검증 — 승인대기 행 기준
async function insCheck(areaId: string, tp: ApvTp, id: string): Promise<ErrorCode | null> {
  if (tp === 'DIC') return null
  if (tp === 'DOM') {
    const { data, error } = await db().from('std_dom').select('key_dom_nm').eq('dom_id', id).maybeSingle()
    if (error) throw error
    return data ? domKeyWordError(areaId, data.key_dom_nm) : 'NOT_FOUND'
  }
  const [t, c] = await Promise.all([
    db().from('std_term').select('dom_id, nstd_yn').eq('term_id', id).maybeSingle(),
    db().from('std_term_dic').select('dic_id').eq('term_id', id).order('dic_seq'),
  ])
  if (t.error) throw t.error
  if (c.error) throw c.error
  if (!t.data) return 'NOT_FOUND'
  const words = await wordsByIds(areaId, c.data.map((x) => x.dic_id))
  if (!words) return 'TERM_WORD_INVALID'
  const rule = termRuleError(words)
  // 일괄등록 비표준(단일 단어) 용어는 단어 수 규칙만 예외
  if (rule && !(rule === 'TERM_SINGLE_WORD' && t.data.nstd_yn === 'Y')) return rule
  return termDomError(areaId, t.data.dom_id, words[words.length - 1].dic_log_nm)
}

interface ReqRow {
  apv_req_id: string
  tgt_tp_cd: ApvTp
  tgt_id: string | null
  act_cd: 'INS' | 'UPD' | 'DEL'
  aftr_val: Record<string, unknown> | null
  base_ver_no: number | null
  apv_sts_cd: string
  req_usr_id: string
}
export async function getReq(areaId: string, reqId: string): Promise<ReqRow | ErrorCode> {
  const { data, error } = await db()
    .from('std_apv_req')
    .select('apv_req_id, tgt_tp_cd, tgt_id, act_cd, aftr_val, base_ver_no, apv_sts_cd, req_usr_id')
    .eq('apv_req_id', reqId)
    .eq('area_id', areaId)
    .eq('del_yn', 'N')
    .maybeSingle()
  if (error) throw error
  if (!data) return 'NOT_FOUND'
  return data.apv_sts_cd === 'REQ' ? (data as ReqRow) : 'APV_NOT_WAITING'
}

// 승인(의견 선택) — 처리자 = 신청자이면 자기 승인
export async function approveReq(areaId: string, reqId: string, usrId: string, opn?: string | null): Promise<{ tgt_id: string } | ErrorCode> {
  const r = await getReq(areaId, reqId)
  if (typeof r === 'string') return r
  let row: Record<string, unknown> = {}
  if (r.act_cd === 'INS') {
    if (!r.tgt_id) return 'APV_LEGACY'
    const bad = await insCheck(areaId, r.tgt_tp_cd, r.tgt_id)
    if (bad) return bad
  } else {
    const prep = await prepareChange(areaId, r.tgt_tp_cd, r.tgt_id!, r.act_cd, r.aftr_val)
    if (typeof prep === 'string') return prep
    if (prep.cur.ver_no !== r.base_ver_no) return 'VERSION_CONFLICT'
    row = prep.row
  }
  const { data, error } = await db().rpc('fn_apv_std_req', { p_req_id: reqId, p_row: row, p_usr_id: usrId, p_opn: opn || null })
  if (error) return mapErr(error, r.tgt_tp_cd)
  return { tgt_id: data as string }
}

export async function rejectReq(areaId: string, reqId: string, usrId: string, reason: string): Promise<true | ErrorCode> {
  const r = await getReq(areaId, reqId)
  if (typeof r === 'string') return r
  const { error } = await db().rpc('fn_rjct_std_req', { p_req_id: reqId, p_usr_id: usrId, p_rsn: reason })
  return error ? mapErr(error) : true
}

// 취소 : 신청자 본인만
export async function cancelReq(areaId: string, reqId: string, usrId: string): Promise<true | ErrorCode> {
  const r = await getReq(areaId, reqId)
  if (typeof r === 'string') return r
  if (r.req_usr_id !== usrId) return 'FORBIDDEN'
  const { error } = await db().rpc('fn_cncl_std_req', { p_req_id: reqId, p_usr_id: usrId })
  return error ? mapErr(error) : true
}

// 등록 신청(승인대기 행 + 요청) → DA가 즉시 승인을 고를 때만 바로 승인(그 외 역할은 값을 보내도 무시). 반환 = 대상 ID·요청 ID·결과 상태
export async function requestIns(
  tp: ApvTp,
  areaId: string,
  row: Record<string, unknown>,
  user: { usr_id: string },
  role: MbrRole,
  opt: { self_apv?: boolean; reason?: string | null },
): Promise<{ tgt_id: string; apv_req_id: string; status: 'REQ' | 'CNFM' } | ErrorCode> {
  const { data, error } = await db().rpc('fn_req_std_ins', { p_tp: tp, p_area_id: areaId, p_row: row, p_usr_id: user.usr_id, p_rsn: opt.reason || null })
  if (error) return mapErr(error, tp)
  const { tgt_id, apv_req_id } = data as { tgt_id: string; apv_req_id: string }
  if (!(opt.self_apv && can(role, 'SELF_APPROVE'))) return { tgt_id, apv_req_id, status: 'REQ' }
  const a = await approveReq(areaId, apv_req_id, user.usr_id, '자기 승인(등록 즉시)')
  // 즉시 승인이 실패하면 승인대기로 남김(승인 화면에서 처리)
  return { tgt_id, apv_req_id, status: typeof a === 'string' ? 'REQ' : 'CNFM' }
}

// 수정·삭제 신청 → DA가 즉시 승인을 고를 때만 바로 승인
export async function requestChg(
  tp: ApvTp,
  areaId: string,
  id: string,
  act: 'UPD' | 'DEL',
  row: Record<string, unknown>,
  ver: number,
  user: { usr_id: string },
  role: MbrRole,
  opt: { self_apv?: boolean; reason?: string | null },
): Promise<{ apv_req_id: string; status: 'REQ' | 'APV'; ver_no?: number } | ErrorCode> {
  const uid = user.usr_id
  const ins = await db()
    .from('std_apv_req')
    .insert({ area_id: areaId, tgt_tp_cd: tp, tgt_id: id, act_cd: act, aftr_val: row, base_ver_no: ver, req_usr_id: uid, req_rsn_txt: opt.reason || null, regr_id: uid, modr_id: uid })
    .select('apv_req_id')
    .single()
  if (ins.error) return mapErr(ins.error)
  const apv_req_id = ins.data.apv_req_id as string
  if (!(opt.self_apv && can(role, 'SELF_APPROVE'))) return { apv_req_id, status: 'REQ' }
  const a = await approveReq(areaId, apv_req_id, uid, '자기 승인(즉시)')
  if (typeof a === 'string') return a
  return { apv_req_id, status: 'APV' }
}

// 반려된 등록 신청 재신청(바뀐 칸 반영)
export async function resubmitIns(tp: ApvTp, id: string, ver: number, row: Record<string, unknown>, usrId: string, reason?: string | null): Promise<{ apv_req_id: string } | ErrorCode> {
  const { data, error } = await db().rpc('fn_resub_std_ins', { p_tp: tp, p_id: id, p_ver: ver, p_row: row, p_usr_id: usrId, p_rsn: reason || null })
  if (error) return mapErr(error, tp)
  return { apv_req_id: data as string }
}

// 등록·수정 요청 본문 공통 칸 : 즉시 승인(DA만 유효)·신청사유
export const reqOptShape = { self_apv: z.boolean().optional(), req_rsn: z.string().trim().max(2000).optional() }
export async function reqOpt(req: Request): Promise<{ self_apv?: boolean; req_rsn?: string }> {
  try {
    const p = z.object(reqOptShape).safeParse(await req.clone().json())
    return p.success ? p.data : {}
  } catch {
    return {}
  }
}

// 처리 대기 중인 수정·삭제 요청(대상 ID → 동작) — 목록 상태 열 '승인대기(수정·삭제)' 표시·상태 필터 공용
export async function pendingChg(areaId: string, tp: ApvTp): Promise<{ pend: Map<string, string> } | { error: { code?: string; message?: string } }> {
  const { data, error } = await db().from('std_apv_req').select('tgt_id, act_cd').eq('area_id', areaId).eq('tgt_tp_cd', tp).in('act_cd', ['UPD', 'DEL']).eq('apv_sts_cd', 'REQ').eq('del_yn', 'N')
  if (error) return { error }
  return { pend: new Map(data.map((r) => [r.tgt_id as string, r.act_cd as string])) }
}

// 상태 필터 — 수정·삭제 대기 행은 승인대기로 분류(DB 상태는 승인완료 유지 : 대기 중에도 기존 값으로 사용 가능)
// ponytail: 대기 ID를 in() 목록으로 넘김, 대기 건이 수백 건을 넘으면 DB 뷰로 옮길 것
type Filt = { eq(c: string, v: unknown): Filt; or(f: string): Filt; not(c: string, o: string, v: unknown): Filt }
export function stsFilter<T>(query: T, sts: string | null, pk: string, pend: Map<string, unknown>): T {
  if (!sts || !Object.hasOwn(STS_NM, sts)) return query
  const q = query as unknown as Filt
  const ids = [...pend.keys()].join(',')
  if (!ids) return q.eq('std_sts_cd', sts) as unknown as T
  if (sts === 'REQ') return q.or(`std_sts_cd.eq.REQ,${pk}.in.(${ids})`) as unknown as T
  return q.eq('std_sts_cd', sts).not(pk, 'in', `(${ids})`) as unknown as T
}

// 목록 행의 등록자·승인자·승인일시 — 등록자 = regr_id 사용자명, 승인 = 대상의 가장 최근 승인(APV) 요청(이관 데이터는 요청이 없어 빈칸)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function withActors<T extends Record<string, unknown>>(areaId: string, tp: ApvTp, pk: string, rows: T[]): Promise<(T & { regr_nm: string | null; apv_nm: string | null; apv_dtm: string | null })[]> {
  const ids = rows.map((r) => r[pk] as string)
  const apv = new Map<string, { usr: string; dtm: string }>()
  if (ids.length) {
    const { data, error } = await db().from('std_apv_req').select('tgt_id, apv_usr_id, apv_dtm').eq('area_id', areaId).eq('tgt_tp_cd', tp).eq('apv_sts_cd', 'APV').eq('del_yn', 'N').in('tgt_id', ids).order('apv_dtm', { ascending: false })
    if (error) throw error
    for (const a of data) if (!apv.has(a.tgt_id as string)) apv.set(a.tgt_id as string, { usr: a.apv_usr_id as string, dtm: a.apv_dtm as string })
  }
  const uids = [...new Set([...rows.map((r) => r.regr_id as string), ...[...apv.values()].map((a) => a.usr)].filter((u) => u && UUID.test(u)))]
  const nm = new Map<string, string>()
  if (uids.length) {
    const { data, error } = await db().from('sys_user').select('usr_id, pi_usr_nm').in('usr_id', uids)
    if (error) throw error
    for (const u of data) nm.set(u.usr_id as string, u.pi_usr_nm as string)
  }
  return rows.map((r) => {
    const a = apv.get(r[pk] as string)
    const reg = r.regr_id as string
    return { ...r, regr_nm: nm.get(reg) ?? (reg && !UUID.test(reg) ? reg : null), apv_nm: a ? (nm.get(a.usr) ?? null) : null, apv_dtm: a?.dtm ?? null }
  })
}
