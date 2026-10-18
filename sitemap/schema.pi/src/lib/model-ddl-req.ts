// DDL 직접 실행(서버, 마스터 지시 2026-10-18) — 접속 프로파일(sql/038 mdl_db_conn)·실행 요청(mdl_ddl_req)·DA 승인(자기 승인 금지)
// 실행 문장 = 요청 때 서버가 buildDdl 로 만든 스냅샷만(클라이언트 SQL 을 받지 않음). 승인은 화면이 본 해시(expect_hash)·현재 모델 재생성 해시·접속 지문을 모두 대조
// 비밀번호 원문은 응답·감사 이력에 남기지 않음(has_pwd 만). 모든 조회·전이에 area_id(·prj_id) 조건 — 소속이 다르면 없는 것으로(404)
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { errMsg } from './api'
import { db } from './db'
import { buildDdl } from './model-ddl'
import { resolveTarget, runOracle, runPg, testConn, type StmtRes } from './db-exec'
import { splitStatements } from './modelpi/ddl-parse'
import { stmtAllowed } from './modelpi/sql-guard'
import { isDbms } from './modelpi/dbms'
import { urlStorable } from './modelpi/jdbc-url'
import { connFp } from './modelpi/seal'
import { directEnabled, openPwd, profileKey, sealPwd } from './secret'

export type ConnRow = {
  conn_id: string
  area_id: string
  conn_nm: string
  dbms_cd: string
  exec_mthd_cd: 'SRV' | 'AGT'
  host_nm: string | null
  port_no: number | null
  db_nm: string | null
  usr_nm: string | null
  pwd_enc_txt: string | null
  agt_id: string | null
  conn_url_txt: string | null
  jndi_nm: string | null
  conn_desc: string | null
  lst_test_dtm: string | null
  ver_no: number
}
const CONN_COLS = 'conn_id, area_id, conn_nm, dbms_cd, exec_mthd_cd, host_nm, port_no, db_nm, usr_nm, pwd_enc_txt, agt_id, conn_url_txt, jndi_nm, conn_desc, lst_test_dtm, ver_no'
export type Fail = { fail: 'NOT_FOUND' | 'INVALID_INPUT' | 'DB_CONN_DISABLED' | 'DB_CONN_MISMATCH' | 'DDL_GATE' | 'DDL_SELF_APPROVE' | 'DDL_CHANGED' | 'DB_CONN_CHANGED' | 'DDL_REQ_STATE' | 'DDL_LIVE_EXISTS' | 'FORBIDDEN' | 'VERSION_CONFLICT' | 'DB_CONN_BLOCKED' | 'DB_CONN_FAIL' | 'DDL_STMT_DENIED'; status: number; detail?: unknown }
const fail = (f: Fail['fail'], status: number, detail?: unknown): Fail => ({ fail: f, status, detail })
export const isFail = (x: unknown): x is Fail => !!x && typeof x === 'object' && 'fail' in x
export const failRes = (f: Fail) => NextResponse.json({ ok: false, code: f.fail, message: errMsg(f.fail), detail: f.detail }, { status: f.status })

// 응답용 — 비밀번호 암호문 빼고 has_pwd, 관리 권한 없으면 접속 주소·계정도 숨김
export function connOut(c: ConnRow, full: boolean) {
  const { pwd_enc_txt, area_id: _a, ...rest } = c
  const base = { ...rest, has_pwd: !!pwd_enc_txt }
  return full ? base : { conn_id: c.conn_id, conn_nm: c.conn_nm, dbms_cd: c.dbms_cd, exec_mthd_cd: c.exec_mthd_cd }
}

export async function listConns(areaId: string) {
  const r = await db().from('mdl_db_conn').select(CONN_COLS).eq('area_id', areaId).eq('del_yn', 'N').order('conn_nm').limit(200)
  if (r.error) throw r.error
  return r.data as ConnRow[]
}

export async function getConn(areaId: string, connId: string) {
  const r = await db().from('mdl_db_conn').select(CONN_COLS).eq('area_id', areaId).eq('conn_id', connId).eq('del_yn', 'N').maybeSingle()
  if (r.error) throw r.error
  return r.data as ConnRow | null
}

// 접속 프로파일 입력 — 주소·DB명·계정은 식별자 문자만(접속 문자열 삽입 차단)
export const connBody = z.object({
  conn_nm: z.string().trim().min(1).max(100),
  dbms_cd: z.string().refine(isDbms),
  exec_mthd_cd: z.enum(['SRV', 'AGT']),
  host_nm: z.string().trim().max(255).regex(/^[A-Za-z0-9.\-:[\]]+$/).nullish(),
  port_no: z.number().int().min(1).max(65535).nullish(),
  db_nm: z.string().trim().max(128).regex(/^[\w.$-]+$/).nullish(),
  usr_nm: z.string().trim().max(128).regex(/^[\w.$@-]+$/).nullish(),
  pwd: z.string().min(1).max(256).optional(),
  agt_id: z.string().uuid().nullish(),
  // 에이전트(sql/039) : JDBC URL(비밀번호 인자 금지) 또는 JNDI 이름 — 비밀번호는 에이전트 PC 환경변수
  conn_url_txt: z.string().trim().max(1000).refine(urlStorable).nullish(),
  jndi_nm: z.string().trim().max(255).regex(/^[\w/:.-]+$/).nullish(),
  conn_desc: z.string().max(2000).nullish(),
})

export interface ConnIn {
  conn_nm: string
  dbms_cd: string
  exec_mthd_cd: 'SRV' | 'AGT'
  host_nm?: string | null
  port_no?: number | null
  db_nm?: string | null
  usr_nm?: string | null
  pwd?: string // 쓰기 전용 — 없으면(수정) 기존 암호문 유지
  agt_id?: string | null
  conn_url_txt?: string | null
  jndi_nm?: string | null
  conn_desc?: string | null
}

const sameTarget = (c: ConnRow, b: ConnIn) => c.exec_mthd_cd === 'SRV' && c.dbms_cd === b.dbms_cd && c.host_nm === b.host_nm && c.port_no === b.port_no && c.db_nm === b.db_nm && c.usr_nm === b.usr_nm

// 등록·수정 — 서버 직접은 주소·계정 필수, 에이전트는 에이전트(같은 분류체계·활성)와 JDBC URL 또는 JNDI 이름 필수(사용자명 선택). 비밀번호는 서버 키로 봉인(AAD = 분류체계:접속)
export async function saveConn(areaId: string, b: ConnIn, uid: string, cur?: ConnRow & { want_ver: number }): Promise<ConnRow | Fail> {
  const srv = b.exec_mthd_cd === 'SRV'
  if (srv && (!b.host_nm || !b.port_no || !b.db_nm || !b.usr_nm)) return fail('INVALID_INPUT', 400)
  if (srv && !profileKey()) return fail('DB_CONN_DISABLED', 503)
  if (!srv) {
    if (!b.agt_id || (!b.conn_url_txt && !b.jndi_nm)) return fail('INVALID_INPUT', 400)
    const g = await db().from('mdl_db_agt').select('agt_id').eq('area_id', areaId).eq('agt_id', b.agt_id).eq('del_yn', 'N').maybeSingle()
    if (g.error) throw g.error
    if (!g.data) return fail('NOT_FOUND', 404)
  }
  // 대상(DBMS·호스트·포트·DB·사용자)을 바꾸면 비밀번호 다시 입력 — 저장된 비밀번호가 새 대상으로 가지 않게
  if (srv && cur && !b.pwd && !sameTarget(cur, b)) return fail('INVALID_INPUT', 400, '접속 대상이 바뀌면 비밀번호를 다시 입력하십시오')
  const id = cur?.conn_id ?? randomUUID()
  let enc = cur?.pwd_enc_txt ?? null
  if (srv && b.pwd) enc = sealPwd(areaId, id, b.pwd)
  if (!srv) enc = null
  const row = {
    conn_nm: b.conn_nm,
    dbms_cd: b.dbms_cd,
    exec_mthd_cd: b.exec_mthd_cd,
    host_nm: srv ? b.host_nm : null,
    port_no: srv ? b.port_no : null,
    db_nm: srv ? b.db_nm : null,
    usr_nm: b.usr_nm || null,
    pwd_enc_txt: enc,
    agt_id: srv ? null : (b.agt_id ?? null),
    conn_url_txt: srv ? null : b.conn_url_txt || null,
    jndi_nm: srv ? null : b.jndi_nm || null,
    conn_desc: b.conn_desc ?? null,
    modr_id: uid,
  }
  if (!cur) {
    const r = await db().from('mdl_db_conn').insert({ conn_id: id, area_id: areaId, ...row, regr_id: uid }).select(CONN_COLS).single()
    if (r.error) throw r.error
    return r.data as ConnRow
  }
  const r = await db().from('mdl_db_conn').update({ ...row, ver_no: cur.ver_no + 1 }).eq('conn_id', id).eq('area_id', areaId).eq('ver_no', cur.want_ver).select(CONN_COLS)
  if (r.error) throw r.error
  return r.data.length ? (r.data[0] as ConnRow) : fail('VERSION_CONFLICT', 409)
}

export async function delConn(areaId: string, c: ConnRow, ver: number, uid: string) {
  const r = await db().from('mdl_db_conn').update({ del_yn: 'Y', del_dtm: new Date().toISOString(), modr_id: uid }).eq('conn_id', c.conn_id).eq('area_id', areaId).eq('ver_no', ver).select('conn_id')
  if (r.error) throw r.error
  return r.data.length > 0
}

// ── 실행 요청 ──
export type ReqRow = {
  req_id: string
  area_id: string
  prj_id: string
  phy_mdl_id: string
  conn_id: string
  dbms_cd: string
  exec_mthd_cd: 'SRV' | 'AGT'
  tbl_ids: string[]
  ddl_hash: string
  stmt_cnt: number
  conn_fp: string
  req_sts_cd: 'REQ' | 'APV' | 'RJCT' | 'CNCL' | 'RUN' | 'DONE' | 'FAIL' | 'PART'
  req_usr_id: string
  apv_usr_id: string | null
  apv_dtm: string | null
  rjct_rsn: string | null
  exec_try_no: number
  lease_exp_dtm: string | null
  exec_end_dtm: string | null
  reg_dtm: string
  ver_no: number
}
const REQ_COLS = 'req_id, area_id, prj_id, phy_mdl_id, conn_id, dbms_cd, exec_mthd_cd, tbl_ids, ddl_hash, stmt_cnt, conn_fp, req_sts_cd, req_usr_id, apv_usr_id, apv_dtm, rjct_rsn, exec_try_no, lease_exp_dtm, exec_end_dtm, reg_dtm, ver_no'

export async function createReq(areaId: string, prjId: string, b: { phy_mdl_id: string; conn_id: string; tbl_ids: string[] }, uid: string): Promise<ReqRow | Fail> {
  const c = await getConn(areaId, b.conn_id)
  if (!c) return fail('NOT_FOUND', 404)
  const x = await buildDdl(areaId, prjId, b.phy_mdl_id, b.tbl_ids)
  if (!x) return fail('NOT_FOUND', 404)
  if (x.dbms_cd !== c.dbms_cd) return fail('DB_CONN_MISMATCH', 400)
  if (x.blockers.length || !x.stmts.length) return fail('DDL_GATE', 400, x.blockers)
  const r = await db()
    .from('mdl_ddl_req')
    .insert({ area_id: areaId, prj_id: prjId, phy_mdl_id: b.phy_mdl_id, conn_id: c.conn_id, dbms_cd: c.dbms_cd, exec_mthd_cd: c.exec_mthd_cd, tbl_ids: b.tbl_ids, ddl_txt: x.ddl, ddl_hash: x.hash, stmt_cnt: x.stmts.length, conn_fp: connFp(c), req_usr_id: uid, regr_id: uid, modr_id: uid })
    .select(REQ_COLS)
    .single()
  if (r.error) throw r.error
  return r.data as ReqRow
}

// 점유 시간이 지난 실행중 요청 = 실패(서버 중단·시간 초과) — 조회 때마다 정리
async function expireRuns(areaId: string) {
  const r = await db().from('mdl_ddl_req').update({ req_sts_cd: 'FAIL', lease_exp_dtm: null, exec_end_dtm: new Date().toISOString(), modr_id: 'SYSTEM' }).eq('area_id', areaId).eq('req_sts_cd', 'RUN').lt('lease_exp_dtm', new Date().toISOString())
  if (r.error) throw r.error
}

export async function listReqs(areaId: string, prjId: string, page: number, size: number) {
  await expireRuns(areaId)
  const r = await db().from('mdl_ddl_req').select(REQ_COLS, { count: 'exact' }).eq('area_id', areaId).eq('prj_id', prjId).eq('del_yn', 'N').order('reg_dtm', { ascending: false }).range((page - 1) * size, page * size - 1)
  if (r.error) throw r.error
  return { items: r.data as ReqRow[], total: r.count ?? 0 }
}

export async function getReq(areaId: string, prjId: string, reqId: string, withDdl = false) {
  await expireRuns(areaId)
  const r = await db().from('mdl_ddl_req').select(withDdl ? `${REQ_COLS}, ddl_txt, run_nonce` : REQ_COLS).eq('area_id', areaId).eq('prj_id', prjId).eq('req_id', reqId).eq('del_yn', 'N').maybeSingle()
  if (r.error) throw r.error
  return r.data as (ReqRow & { ddl_txt?: string; run_nonce?: string | null }) | null
}

// 문장별 결과(시도 번호 지정 없으면 전부)
export async function reqStmts(areaId: string, reqId: string) {
  const r = await db().from('mdl_ddl_exec_stmt').select('exec_try_no, stmt_seq, stmt_txt, rslt_cd, err_cd, err_msg, elapsed_ms, reg_dtm').eq('area_id', areaId).eq('req_id', reqId).eq('del_yn', 'N').order('exec_try_no').order('stmt_seq').limit(5000)
  if (r.error) throw r.error
  return r.data
}

// 상태 전이(낙관적 : 현재 상태 조건) — 0건이면 다른 사용자가 먼저 바꿈
export async function move(q: ReqRow, from: ReqRow['req_sts_cd'][], set: Record<string, unknown>): Promise<ReqRow | Fail> {
  const r = await db().from('mdl_ddl_req').update({ ...set, ver_no: q.ver_no + 1 }).eq('req_id', q.req_id).eq('area_id', q.area_id).in('req_sts_cd', from).eq('ver_no', q.ver_no).select(REQ_COLS)
  if (r.error) return r.error.code === '23505' ? fail('DDL_LIVE_EXISTS', 409) : Promise.reject(r.error)
  return r.data.length ? (r.data[0] as ReqRow) : fail('DDL_REQ_STATE', 409)
}

// 승인 — DA, 요청자 ≠ 승인자, 화면 해시 = 저장 해시 = 현재 모델 재생성 해시, 접속 지문 그대로
export async function approveReq(areaId: string, prjId: string, reqId: string, expectHash: string, uid: string): Promise<ReqRow | Fail> {
  if (!profileKey()) return fail('DB_CONN_DISABLED', 503)
  const q = await getReq(areaId, prjId, reqId)
  if (!q) return fail('NOT_FOUND', 404)
  if (q.req_sts_cd !== 'REQ') return fail('DDL_REQ_STATE', 409)
  if (q.req_usr_id === uid) return fail('DDL_SELF_APPROVE', 403)
  if (q.ddl_hash !== expectHash) return fail('DDL_CHANGED', 409)
  const c = await getConn(areaId, q.conn_id)
  if (!c || connFp(c) !== q.conn_fp) return fail('DB_CONN_CHANGED', 409)
  const x = await buildDdl(areaId, prjId, q.phy_mdl_id, q.tbl_ids)
  if (!x || x.hash !== q.ddl_hash || x.blockers.length) return fail('DDL_CHANGED', 409)
  return move(q, ['REQ'], { req_sts_cd: 'APV', apv_usr_id: uid, apv_dtm: new Date().toISOString(), modr_id: uid })
}

export async function rejectReq(areaId: string, prjId: string, reqId: string, rsn: string, uid: string): Promise<ReqRow | Fail> {
  const q = await getReq(areaId, prjId, reqId)
  if (!q) return fail('NOT_FOUND', 404)
  if (q.req_sts_cd !== 'REQ' && q.req_sts_cd !== 'APV') return fail('DDL_REQ_STATE', 409)
  return move(q, ['REQ', 'APV'], { req_sts_cd: 'RJCT', rjct_rsn: rsn, modr_id: uid })
}

// 취소 — 요청자 본인, 실행 전(대기·승인)만
export async function cancelReq(areaId: string, prjId: string, reqId: string, uid: string): Promise<ReqRow | Fail> {
  const q = await getReq(areaId, prjId, reqId)
  if (!q) return fail('NOT_FOUND', 404)
  if (q.req_usr_id !== uid) return fail('FORBIDDEN', 403)
  if (q.req_sts_cd !== 'REQ' && q.req_sts_cd !== 'APV') return fail('DDL_REQ_STATE', 409)
  return move(q, ['REQ', 'APV'], { req_sts_cd: 'CNCL', modr_id: uid })
}

// ── 서버 직접 실행(SRV) ──
const LEASE_MS = 90_000 // 함수 최대 60초 + 여유
const BUDGET_MS = 50_000 // 실행 예산(함수 제한 60초 안)
const hashStmts = (st: string[]) => createHash('sha256').update(st.join(';\n')).digest('hex')

// 연결 시험(서버 직접 접속만) — 저장된 비밀번호로 SELECT 1, 성공하면 시험 일시 기록
// ponytail: 시험 횟수 제한 없음 — 저장된 비밀번호만 쓰고 접속 관리(DA) 권한이라 대입 공격 경로는 없음, 남용되면 접속당 분당 제한
export async function testConnById(areaId: string, connId: string): Promise<{ ok: true } | Fail> {
  if (!profileKey() || !directEnabled()) return fail('DB_CONN_DISABLED', 503)
  const c = await getConn(areaId, connId)
  if (!c) return fail('NOT_FOUND', 404)
  if (c.exec_mthd_cd !== 'SRV') return fail('INVALID_INPUT', 400)
  const pwd = c.pwd_enc_txt ? openPwd(areaId, connId, c.pwd_enc_txt) : null
  if (pwd == null) return fail('DB_CONN_FAIL', 400, '저장된 비밀번호를 열 수 없습니다 — 비밀번호를 다시 입력하십시오')
  const t = await resolveTarget(c)
  if (t === 'BLOCKED') return fail('DB_CONN_BLOCKED', 400)
  if (t === 'DNS') return fail('DB_CONN_FAIL', 400, '호스트 이름을 찾을 수 없습니다')
  const r = await testConn(c.dbms_cd, t, pwd)
  if (!r.ok) return fail('DB_CONN_FAIL', 400, r.msg)
  const u = await db().from('mdl_db_conn').update({ lst_test_dtm: new Date().toISOString() }).eq('conn_id', connId).eq('area_id', areaId)
  if (u.error) throw u.error
  return { ok: true }
}

// 저장 전 연결 시험(마스터 지시 2026-10-18) — 입력 중인 값으로 SELECT 1, 저장·기록 없음. 수정 중 비밀번호를 비우면 저장된 비밀번호 사용
export async function testConnDraft(areaId: string, b: ConnIn, connId?: string): Promise<{ ok: true } | Fail> {
  if (!profileKey() || !directEnabled()) return fail('DB_CONN_DISABLED', 503)
  if (b.exec_mthd_cd !== 'SRV' || !b.host_nm || !b.port_no || !b.db_nm || !b.usr_nm) return fail('INVALID_INPUT', 400)
  let pwd = b.pwd ?? null
  if (pwd == null && connId) {
    const c = await getConn(areaId, connId)
    if (!c) return fail('NOT_FOUND', 404)
    // 저장된 비밀번호는 대상이 그대로일 때만(대상을 바꿔 비밀번호를 다른 서버로 보내는 경로 차단 — 보안 검토 2026-10-18)
    if (sameTarget(c, b)) pwd = c.pwd_enc_txt ? openPwd(areaId, connId, c.pwd_enc_txt) : null
    else return fail('DB_CONN_FAIL', 400, '접속 대상이 바뀌면 비밀번호를 다시 입력하십시오')
  }
  if (pwd == null) return fail('DB_CONN_FAIL', 400, '비밀번호를 입력하십시오')
  const t = await resolveTarget({ host_nm: b.host_nm, port_no: b.port_no, db_nm: b.db_nm, usr_nm: b.usr_nm })
  if (t === 'BLOCKED') return fail('DB_CONN_BLOCKED', 400)
  if (t === 'DNS') return fail('DB_CONN_FAIL', 400, '호스트 이름을 찾을 수 없습니다')
  const r = await testConn(b.dbms_cd, t, pwd)
  return r.ok ? { ok: true } : fail('DB_CONN_FAIL', 400, r.msg)
}

// 실행 — 승인(또는 실패·일부 실행 뒤 재실행) 요청을 점유(RUN·시도 번호 증가) → 저장 DDL 만 실행 → 문장별 결과·최종 상태
export async function runReq(areaId: string, prjId: string, reqId: string, uid: string): Promise<(ReqRow & { results: StmtRes[] }) | Fail> {
  if (!profileKey() || !directEnabled()) return fail('DB_CONN_DISABLED', 503)
  const q = await getReq(areaId, prjId, reqId, true)
  if (!q) return fail('NOT_FOUND', 404)
  if (q.exec_mthd_cd !== 'SRV' || !['APV', 'FAIL', 'PART'].includes(q.req_sts_cd) || !q.apv_usr_id) return fail('DDL_REQ_STATE', 409)
  const c = await getConn(areaId, q.conn_id)
  if (!c || connFp(c) !== q.conn_fp) return fail('DB_CONN_CHANGED', 409)
  const stmts = splitStatements(q.ddl_txt ?? '')
  if (hashStmts(stmts) !== q.ddl_hash) return fail('DDL_CHANGED', 409) // 저장본 변조 방어
  const x = await buildDdl(areaId, prjId, q.phy_mdl_id, q.tbl_ids)
  if (!x || x.hash !== q.ddl_hash) return fail('DDL_CHANGED', 409) // 승인 뒤 모델이 바뀜 — 새로 요청
  const denied = stmts.findIndex((st) => !stmtAllowed(st))
  if (denied >= 0) return fail('DDL_STMT_DENIED', 400, `${denied + 1}번째 문장`)
  const pwd = c.pwd_enc_txt ? openPwd(areaId, c.conn_id, c.pwd_enc_txt) : null
  if (pwd == null) return fail('DB_CONN_FAIL', 400, '저장된 비밀번호를 열 수 없습니다 — 비밀번호를 다시 입력하십시오')
  const t = await resolveTarget(c)
  if (t === 'BLOCKED') return fail('DB_CONN_BLOCKED', 400)
  if (t === 'DNS') return fail('DB_CONN_FAIL', 400, '호스트 이름을 찾을 수 없습니다')
  // 점유 — 상태·버전 조건으로 원자 전이(동시 실행은 0건 → 409)
  const tryNo = q.exec_try_no + 1
  const own = await move(q, ['APV', 'FAIL', 'PART'], { req_sts_cd: 'RUN', exec_try_no: tryNo, lease_exp_dtm: new Date(Date.now() + LEASE_MS).toISOString(), run_nonce: randomBytes(16).toString('hex'), exec_end_dtm: null, modr_id: uid })
  if (isFail(own)) return own
  const deadline = Date.now() + BUDGET_MS
  if (c.dbms_cd === '0014') {
    const results = await runPg(t, pwd, stmts, deadline)
    return finish(own, tryNo, results, results.every((r) => r.rslt === 'OK') ? 'DONE' : 'FAIL', uid)
  }
  // Oracle : 이전 시도에서 성공한 문장은 건너뛰고 이어서
  const prev = await db().from('mdl_ddl_exec_stmt').select('stmt_seq').eq('area_id', areaId).eq('req_id', reqId).eq('rslt_cd', 'OK').eq('del_yn', 'N')
  if (prev.error) throw prev.error
  const done = new Set((prev.data as { stmt_seq: number }[]).map((r) => r.stmt_seq))
  const results = (await runOracle(t, pwd, stmts, deadline, done)).map((r) => (done.has(r.seq) ? { ...r, err_msg: '이전 시도에서 성공' } : r))
  const okAll = results.every((r) => r.rslt === 'OK' || done.has(r.seq))
  const anyOk = done.size > 0 || results.some((r) => r.rslt === 'OK')
  return finish(own, tryNo, results, okAll ? 'DONE' : anyOk ? 'PART' : 'FAIL', uid)
}

async function finish(q: ReqRow, tryNo: number, results: StmtRes[], sts: 'DONE' | 'FAIL' | 'PART', uid: string) {
  const ins = await db().from('mdl_ddl_exec_stmt').insert(results.map((r) => ({ area_id: q.area_id, req_id: q.req_id, exec_try_no: tryNo, stmt_seq: r.seq, stmt_txt: r.txt, rslt_cd: r.rslt, err_cd: r.err_cd ?? null, err_msg: r.err_msg ?? null, elapsed_ms: r.ms ?? null, regr_id: uid, modr_id: uid })))
  if (ins.error) console.error('[ddl-exec] 결과 기록 실패', ins.error.code) // 실행은 끝남 — 상태는 그대로 확정
  const r = await db().from('mdl_ddl_req').update({ req_sts_cd: sts, lease_exp_dtm: null, exec_end_dtm: new Date().toISOString(), ver_no: q.ver_no + 1, modr_id: uid }).eq('req_id', q.req_id).eq('area_id', q.area_id).eq('req_sts_cd', 'RUN').eq('exec_try_no', tryNo).select(REQ_COLS)
  if (r.error) throw r.error
  return { ...((r.data[0] as ReqRow | undefined) ?? { ...q, req_sts_cd: sts }), results }
}
