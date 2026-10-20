// DDL 로컬 에이전트(서버, 마스터 지시 2026-10-18 "JDBC·JNDI 등 직접 연결") — 사내망·Tibero 는 고객 PC 의 Java 에이전트가 승인된 작업을 가져가 실행
// 토큰 spa_<base64url 32바이트> : 발급 때 한 번만 응답, SHA-256 만 저장(sql/039), 만료 필수. 에이전트는 바깥으로만 접속(HTTPS 폴링)
// 가져가기(claim) = 그 에이전트 접속의 승인 요청 1건 → 대조(접속 지문·저장본 해시·현재 모델 재생성 해시·문장 화이트리스트) → RUN·시도 번호·일회값·점유 10분
// 보고(result) = 소유(에이전트·분류체계·접속)·RUN·일회값·시도 번호·점유 유효 모두 맞을 때만, 보고마다 점유 연장, final 로 DONE·PART·FAIL
import { createHash, randomBytes } from 'node:crypto'
import { db } from './db'
import { buildDdl } from './model-ddl'
import { getConn, move, type ReqRow } from './model-ddl-req'
import { splitStatements } from './modelpi/ddl-parse'
import { connFp } from './modelpi/seal'
import { deniedAt } from './modelpi/sql-guard'

export type AgtRow = { agt_id: string; area_id: string; agt_nm: string; tkn_pfx: string; exp_dtm: string; lst_seen_dtm: string | null; ver_no: number }
const AGT_COLS = 'agt_id, area_id, agt_nm, tkn_pfx, exp_dtm, lst_seen_dtm, ver_no'
const LEASE_MS = 10 * 60_000
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

export async function listAgts(areaId: string) {
  const r = await db().from('mdl_db_agt').select(AGT_COLS).eq('area_id', areaId).eq('del_yn', 'N').order('agt_nm').limit(100)
  if (r.error) throw r.error
  return r.data as AgtRow[]
}

// 발급 — 토큰 원문은 이 응답에서만
export async function createAgt(areaId: string, nm: string, days: number, uid: string) {
  const tkn = `spa_${randomBytes(32).toString('base64url')}`
  const r = await db()
    .from('mdl_db_agt')
    .insert({ area_id: areaId, agt_nm: nm, tkn_hash: sha(tkn), tkn_pfx: tkn.slice(0, 8), exp_dtm: new Date(Date.now() + days * 86_400_000).toISOString(), regr_id: uid, modr_id: uid })
    .select(AGT_COLS)
    .single()
  if (r.error) throw r.error
  return { agt: r.data as AgtRow, token: tkn }
}

export async function revokeAgt(areaId: string, agtId: string, uid: string) {
  const r = await db().from('mdl_db_agt').update({ del_yn: 'Y', del_dtm: new Date().toISOString(), modr_id: uid }).eq('area_id', areaId).eq('agt_id', agtId).eq('del_yn', 'N').select('agt_id')
  if (r.error) throw r.error
  return r.data.length > 0
}

// Bearer 토큰 → 활성 에이전트(폐기·만료면 null), 최종 확인 일시 기록
export async function agtByToken(auth: string | null): Promise<AgtRow | null> {
  const m = /^Bearer (spa_[\w-]{43})$/.exec(auth ?? '')
  if (!m) return null
  const r = await db().from('mdl_db_agt').select(AGT_COLS).eq('tkn_hash', sha(m[1])).eq('del_yn', 'N').gt('exp_dtm', new Date().toISOString()).maybeSingle()
  if (r.error) throw r.error
  if (!r.data) return null
  await db().from('mdl_db_agt').update({ lst_seen_dtm: new Date().toISOString() }).eq('agt_id', (r.data as AgtRow).agt_id)
  return r.data as AgtRow
}

const REQ_SEL = 'req_id, area_id, prj_id, phy_mdl_id, conn_id, dbms_cd, exec_mthd_cd, tbl_ids, ddl_hash, stmt_cnt, conn_fp, req_sts_cd, req_usr_id, apv_usr_id, apv_dtm, rjct_rsn, exec_try_no, lease_exp_dtm, exec_end_dtm, reg_dtm, ver_no, ddl_txt, run_nonce'
type ReqFull = ReqRow & { ddl_txt: string; run_nonce: string | null }

const TEST_TTL_MS = 10 * 60_000 // 접속 시험 요청은 10분 안에만(에이전트가 꺼져 있으면 화면은 대기 안내)

// 작업 가져가기 — 접속 시험 요청이 먼저, 없으면 승인된 DDL 1건, 둘 다 없으면 null. 대조 실패 요청은 FAIL 로 돌려 다시 잡히지 않게
export async function claimJob(g: AgtRow) {
  const cs = await db().from('mdl_db_conn').select('conn_id, dbms_cd, conn_url_txt, jndi_nm, usr_nm, agt_test_req_dtm, agt_test_end_dtm').eq('area_id', g.area_id).eq('agt_id', g.agt_id).eq('del_yn', 'N')
  if (cs.error) throw cs.error
  const conns = cs.data as { conn_id: string; dbms_cd: string; conn_url_txt: string | null; jndi_nm: string | null; usr_nm: string | null; agt_test_req_dtm: string | null; agt_test_end_dtm: string | null }[]
  const t = conns.find((c) => c.agt_test_req_dtm && !c.agt_test_end_dtm && Date.now() - new Date(c.agt_test_req_dtm).getTime() < TEST_TTL_MS)
  if (t) return { test: { conn_id: t.conn_id, dbms_cd: t.dbms_cd, conn_url: t.conn_url_txt, jndi_nm: t.jndi_nm, usr_nm: t.usr_nm, req_dtm: t.agt_test_req_dtm } }
  const connIds = conns.map((x) => x.conn_id)
  if (!connIds.length) return null
  const q = await db().from('mdl_ddl_req').select(REQ_SEL).eq('area_id', g.area_id).in('conn_id', connIds).eq('exec_mthd_cd', 'AGT').eq('req_sts_cd', 'APV').eq('del_yn', 'N').order('apv_dtm').limit(1)
  if (q.error) throw q.error
  const r = (q.data as ReqFull[])[0]
  if (!r) return null
  const c = await getConn(g.area_id, r.conn_id)
  const stmts = splitStatements(r.ddl_txt)
  const x = await buildDdl(g.area_id, r.prj_id, r.phy_mdl_id, r.tbl_ids)
  const why = !c || c.agt_id !== g.agt_id || connFp(c) !== r.conn_fp ? 'DB_CONN_CHANGED' : sha(stmts.join(';\n')) !== r.ddl_hash || !x || x.hash !== r.ddl_hash ? 'DDL_CHANGED' : deniedAt(stmts) >= 0 ? 'DDL_STMT_DENIED' : null
  if (why) {
    await move(r, ['APV'], { req_sts_cd: 'FAIL', exec_end_dtm: new Date().toISOString(), modr_id: `AGT:${g.agt_id}` })
    return { skipped: r.req_id, why }
  }
  const tryNo = r.exec_try_no + 1
  const nonce = randomBytes(16).toString('hex')
  const own = await move(r, ['APV'], { req_sts_cd: 'RUN', exec_try_no: tryNo, lease_exp_dtm: new Date(Date.now() + LEASE_MS).toISOString(), run_nonce: nonce, exec_end_dtm: null, modr_id: `AGT:${g.agt_id}` })
  if ('fail' in own) return null // 다른 에이전트·사용자가 먼저 — 다음 폴링
  const prev = await db().from('mdl_ddl_exec_stmt').select('stmt_seq').eq('area_id', g.area_id).eq('req_id', r.req_id).eq('rslt_cd', 'OK').eq('del_yn', 'N')
  if (prev.error) throw prev.error
  return {
    apv_usr_id: r.apv_usr_id, // 감사 이력 사용자(실행을 승인한 사람) — 에이전트 ID 는 값에 기록
    job: {
      req_id: r.req_id,
      conn_id: r.conn_id,
      dbms_cd: r.dbms_cd,
      conn_url: c!.conn_url_txt,
      jndi_nm: c!.jndi_nm,
      usr_nm: c!.usr_nm,
      stmts,
      sha256: r.ddl_hash,
      try_no: tryNo,
      run_nonce: nonce,
      done_seqs: r.dbms_cd === '0014' ? [] : (prev.data as { stmt_seq: number }[]).map((p) => p.stmt_seq), // PostgreSQL 은 트랜잭션이라 처음부터
    },
  }
}

export interface AgtResult {
  seq: number
  rslt: 'OK' | 'ERR' | 'SKIP' | 'RBK'
  err_cd?: string | null
  err_msg?: string | null
  ms?: number | null
}

// 결과 보고 — 소유·상태·일회값·시도·점유 확인 실패는 전부 null(404 로 같은 응답)
export async function reportJob(g: AgtRow, reqId: string, b: { run_nonce: string; try_no: number; results: AgtResult[]; final: 'DONE' | 'FAIL' | 'PART' | null }) {
  const q = await db().from('mdl_ddl_req').select(REQ_SEL).eq('area_id', g.area_id).eq('req_id', reqId).eq('del_yn', 'N').maybeSingle()
  if (q.error) throw q.error
  const r = q.data as ReqFull | null
  if (!r || r.req_sts_cd !== 'RUN' || r.exec_mthd_cd !== 'AGT' || r.run_nonce !== b.run_nonce || r.exec_try_no !== b.try_no || !r.lease_exp_dtm || new Date(r.lease_exp_dtm).getTime() < Date.now()) return null
  const c = await getConn(g.area_id, r.conn_id)
  if (!c || c.agt_id !== g.agt_id) return null
  const stmts = splitStatements(r.ddl_txt)
  const rows = b.results.filter((x) => x.seq >= 1 && x.seq <= stmts.length).map((x) => ({ area_id: g.area_id, req_id: r.req_id, exec_try_no: r.exec_try_no, stmt_seq: x.seq, stmt_txt: stmts[x.seq - 1], rslt_cd: x.rslt, err_cd: x.err_cd?.slice(0, 20) ?? null, err_msg: x.err_msg?.slice(0, 200) ?? null, elapsed_ms: x.ms ?? null, regr_id: `AGT:${g.agt_id}`, modr_id: `AGT:${g.agt_id}` }))
  for (const row of rows) {
    const ins = await db().from('mdl_ddl_exec_stmt').insert(row)
    if (ins.error && ins.error.code !== '23505') throw ins.error // 같은 문장 재보고는 무시
  }
  const set: Record<string, unknown> = b.final
    ? { req_sts_cd: b.final, lease_exp_dtm: null, exec_end_dtm: new Date().toISOString(), modr_id: `AGT:${g.agt_id}` }
    : { lease_exp_dtm: new Date(Date.now() + LEASE_MS).toISOString(), modr_id: `AGT:${g.agt_id}` }
  const u = await db().from('mdl_ddl_req').update({ ...set, ver_no: r.ver_no + 1 }).eq('req_id', r.req_id).eq('area_id', g.area_id).eq('req_sts_cd', 'RUN').eq('exec_try_no', r.exec_try_no).eq('run_nonce', b.run_nonce).select('req_sts_cd')
  if (u.error) throw u.error
  return u.data.length ? { req_sts_cd: (u.data[0] as { req_sts_cd: string }).req_sts_cd, saved: rows.length, apv_usr_id: r.apv_usr_id } : null
}

// 접속 시험 결과 — 그 에이전트 접속이고 대기 중인 시험(요청 일시 일치)일 때만
export async function reportTest(g: AgtRow, connId: string, b: { req_dtm: string; ok: boolean; msg?: string | null }) {
  const u = await db()
    .from('mdl_db_conn')
    .update({ agt_test_end_dtm: new Date().toISOString(), agt_test_rslt_cd: b.ok ? 'OK' : 'ERR', agt_test_msg: (b.msg ?? '').slice(0, 200) || null, ...(b.ok ? { lst_test_dtm: new Date().toISOString() } : {}) })
    .eq('area_id', g.area_id)
    .eq('conn_id', connId)
    .eq('agt_id', g.agt_id)
    .eq('del_yn', 'N')
    .eq('agt_test_req_dtm', b.req_dtm)
    .is('agt_test_end_dtm', null)
    .select('conn_id')
  if (u.error) throw u.error
  return u.data.length > 0
}
