// SQL 편집기 에이전트 중계(서버 전용, 2026-11-07, sql/078 mdl_sql_agt_req) — AGT 접속은 서버가 판정한 지시서를 큐에 넣고, 로컬 에이전트가 가져가 실행·업로드한 결과를 서버가 1초 간격으로 수거
// 상태 : WAIT(등록) → RUN(에이전트 claim, 일회값·점유 120초) → DONE/FAIL(업로드) → 서버가 읽는 즉시 rslt_val 비움 / 기한 지난 WAIT = CNCL(대기 포기)·EXP(정리), 점유 만료 RUN = FAIL(LEASE_EXP)
// 격리 : claim·업로드·수거 모두 agt_id·area_id(수거는 요청자까지) 조건부 — 어긋나면 0건(라우트는 404, 존재 비노출). 순수 판정은 sql-agent-core.ts
import 'server-only'
import { randomBytes } from 'node:crypto'
import { db } from './db'
import type { AgtRow } from './model-agent'
import type { ConnRow } from './model-ddl-req'
import { AGT_BUSY_MAX, agtGateCode, doneCode, missingCol, budgetMs, expAt, giveUpOutcome, LEASE_MS, POLL_MS, type ReqVal, type RsltBody, type RsltItem, type SqlAgtCode } from './sql-agent-core'

const T = 'mdl_sql_agt_req'
const iso = (ms = Date.now()) => new Date(ms).toISOString()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// 큐 등록 게이트 — 에이전트 확인(폐기·만료 포함)과 접속 혼잡(살아 있는 WAIT·RUN 만 — 정리 전 기한 지난 행 제외)을 한 번에(R-P1)
export async function gateAgt(c: ConnRow): Promise<SqlAgtCode | null> {
  const now = iso()
  const agt = (cols: string) => db().from('mdl_db_agt').select(cols).eq('agt_id', c.agt_id).eq('area_id', c.area_id).eq('del_yn', 'N').gt('exp_dtm', now).maybeSingle()
  const [a0, b] = await Promise.all([
    agt('lst_seen_dtm, agt_ver_txt'),
    db().from(T).select('req_id').eq('conn_id', c.conn_id).eq('del_yn', 'N').or(`and(req_sts_cd.eq.WAIT,exp_dtm.gt.${now}),and(req_sts_cd.eq.RUN,lease_exp_dtm.gt.${now})`).limit(AGT_BUSY_MAX), // 상한까지만 읽음(정확 건수 불필요)
  ])
  if (b.error) throw b.error
  const a = missingCol(a0.error) ? await agt('lst_seen_dtm') : a0 // sql/079 미적용 — 버전 없이 재조회(ver undefined = 판정 보류)
  if (a.error) throw a.error
  const r = a.data as unknown as { lst_seen_dtm: string | null; agt_ver_txt?: string | null } | null
  return agtGateCode(r && { seen: r.lst_seen_dtm, ver: r.agt_ver_txt }, b.data.length, Date.now())
}

type Taken = { req_sts_cd: string; rslt_val: { results?: RsltItem[] } | null; err_cd: string | null; err_msg: string | null; rslt_sz: number | null }
export type Waited = { results: RsltItem[]; err: { err_cd: string | null; err_msg: string | null }; sts: string } | { code: 'SQL_AGT_NO_PICKUP' | 'SQL_AGT_TIMEOUT' | 'SQL_AGT_RSLT_SIZE' }

// 수거 — 요청자 본인 것만, 끝났으면 결과 값을 즉시 비움(결과 값 보관 금지 원칙)
export async function takeResult(areaId: string, uid: string, reqId: string): Promise<Taken | null> {
  const r = await db().from(T).select('req_sts_cd, rslt_val, err_cd, err_msg, rslt_sz').eq('req_id', reqId).eq('area_id', areaId).eq('req_usr_id', uid).maybeSingle()
  if (r.error) throw r.error
  const x = r.data as Taken | null
  if (x && (x.req_sts_cd === 'DONE' || x.req_sts_cd === 'FAIL') && x.rslt_val != null) {
    const u = await db().from(T).update({ rslt_val: null, rslt_rmvl_dtm: iso(), modr_id: uid }).eq('req_id', reqId).is('rslt_rmvl_dtm', null)
    if (u.error) console.error('[sql-agt-rmvl]', u.error.code, u.error.message) // 못 비운 값은 정리 작업이 5분 뒤 비움
  }
  return x
}

// 대기 포기 — 아직 아무도 안 가져간 경우만 취소(1건 = 실행 안 됨)
export async function giveUp(areaId: string, uid: string, reqId: string) {
  const u = await db().from(T).update({ req_sts_cd: 'CNCL', modr_id: uid }).eq('req_id', reqId).eq('area_id', areaId).eq('req_sts_cd', 'WAIT').select('req_id')
  if (u.error) throw u.error
  return u.data.length
}

// 등록 → 1초 간격 수거(상한 = exp_dtm) → 기한이면 대기 포기
export async function enqueueAndWait(p: { c: ConnRow; uid: string; tp: 'RUN' | 'META'; val: ReqVal; startedAt: number; wait: { waitMs: number; capMs: number } }): Promise<Waited> {
  const exp = expAt(Date.now(), p.startedAt, p.wait)
  const ins = await db().from(T).insert({ area_id: p.c.area_id, conn_id: p.c.conn_id, agt_id: p.c.agt_id, req_usr_id: p.uid, req_tp_cd: p.tp, req_val: p.val, exp_dtm: iso(exp), regr_id: p.uid, modr_id: p.uid }).select('req_id').single()
  if (ins.error) throw ins.error
  const id = (ins.data as { req_id: string }).req_id
  const done = (x: Taken): Waited => { const dc = doneCode(x.req_sts_cd, x.err_cd); return dc ? { code: dc } : { results: x.rslt_val?.results ?? [], err: { err_cd: x.err_cd, err_msg: x.err_msg }, sts: x.req_sts_cd } }
  for (;;) {
    await sleep(Math.max(0, Math.min(POLL_MS, exp - Date.now())))
    const x = await takeResult(p.c.area_id, p.uid, id)
    if (x && (x.req_sts_cd === 'DONE' || x.req_sts_cd === 'FAIL')) return done(x)
    if (Date.now() >= exp) break
  }
  const n = await giveUp(p.c.area_id, p.uid, id)
  const x = n ? null : await takeResult(p.c.area_id, p.uid, id) // 0건 = 막판에 가져갔거나 끝남 — 한 번 더 읽어 판정
  const o = giveUpOutcome(n, x?.req_sts_cd ?? null)
  return o === 'DONE' && x ? done(x) : { code: o === 'DONE' ? 'SQL_AGT_TIMEOUT' : o }
}

type SqlConn = { conn_id: string; dbms_cd: string; conn_url_txt: string | null; jndi_nm: string | null; usr_nm: string | null }
type WaitRow = { req_id: string; conn_id: string; req_val: ReqVal; exp_dtm: string }

// 가장 오래된 대기 요청 1건(claim 전 조회 — claimJob 이 접속 목록 조회와 병렬로 부름)
export async function nextSql(g: AgtRow): Promise<WaitRow | null> {
  const q = await db().from(T).select('req_id, conn_id, req_val, exp_dtm').eq('agt_id', g.agt_id).eq('area_id', g.area_id).eq('req_sts_cd', 'WAIT').eq('del_yn', 'N').gt('exp_dtm', iso()).order('reg_dtm').limit(1)
  if (q.error) throw q.error
  return (q.data as WaitRow[])[0] ?? null
}

// 가져가기 — 접속이 그 에이전트 목록에 없으면 FAIL(DB_CONN_CHANGED), WAIT·기한 안 조건부 RUN(0건 = 선점됨·기한 지남 → null)
export async function claimSql(g: AgtRow, r: WaitRow, conns: SqlConn[]) {
  const by = `AGT:${g.agt_id}`
  const c = conns.find((x) => x.conn_id === r.conn_id)
  if (!c) {
    const f = await db().from(T).update({ req_sts_cd: 'FAIL', exec_end_dtm: iso(), err_cd: 'DB_CONN_CHANGED', err_msg: '요청 뒤 접속 정보가 바뀌었습니다 — 새로 요청하십시오', modr_id: by }).eq('req_id', r.req_id).eq('agt_id', g.agt_id).eq('area_id', g.area_id).eq('req_sts_cd', 'WAIT')
    if (f.error) throw f.error
    return null
  }
  const nonce = randomBytes(16).toString('hex')
  const u = await db().from(T).update({ req_sts_cd: 'RUN', run_nonce: nonce, lease_exp_dtm: iso(Date.now() + LEASE_MS), modr_id: by }).eq('req_id', r.req_id).eq('agt_id', g.agt_id).eq('area_id', g.area_id).eq('req_sts_cd', 'WAIT').gt('exp_dtm', iso()).select('req_id')
  if (u.error) throw u.error
  if (!u.data.length) return null
  return { req_id: r.req_id, run_nonce: nonce, conn_id: c.conn_id, dbms_cd: c.dbms_cd, conn_url: c.conn_url_txt, jndi_nm: c.jndi_nm, usr_nm: c.usr_nm, budget_ms: budgetMs(new Date(r.exp_dtm).getTime(), Date.now()), poll_sec: 1, req: r.req_val }
}

// 결과 업로드 — 에이전트·분류체계·요청·RUN·일회값·점유 유효 모두 맞을 때만(0건 = false → 404)
// 크기 초과(size null·results 없음) = 같은 대조를 통과할 때만 FAIL(RSLT_SIZE, 결과 값 없음) — 화면은 413 즉시, 접속 동시 슬롯 반환
export async function reportSql(g: AgtRow, reqId: string, b: Omit<RsltBody, 'results'> & { results?: RsltBody['results'] }, size: number | null) {
  const now = iso()
  const u = await db()
    .from(T)
    .update({ req_sts_cd: b.final, rslt_val: b.results ? { results: b.results } : null, rslt_sz: size, exec_end_dtm: now, err_cd: b.err_cd?.slice(0, 20) ?? null, err_msg: b.err_msg?.slice(0, 200) ?? null, modr_id: `AGT:${g.agt_id}` })
    .eq('req_id', reqId)
    .eq('agt_id', g.agt_id)
    .eq('area_id', g.area_id)
    .eq('req_sts_cd', 'RUN')
    .eq('run_nonce', b.run_nonce)
    .gt('lease_exp_dtm', now)
    .select('req_id')
  if (u.error) throw u.error
  return u.data.length > 0
}

// 정리(cron /api/mon/collect) — 기한 지난 WAIT = EXP, 점유 만료 RUN = FAIL(LEASE_EXP), 끝난 지 5분 지난 결과 값 비움
export async function sweepSqlAgt() {
  const now = iso(), old = iso(Date.now() - 5 * 60_000), by = 'SWEEP'
  const [a, b, c] = await Promise.all([
    db().from(T).update({ req_sts_cd: 'EXP', modr_id: by }).eq('req_sts_cd', 'WAIT').lt('exp_dtm', now).select('req_id'),
    db().from(T).update({ req_sts_cd: 'FAIL', err_cd: 'LEASE_EXP', exec_end_dtm: now, modr_id: by }).eq('req_sts_cd', 'RUN').lt('lease_exp_dtm', now).select('req_id'),
    db().from(T).update({ rslt_val: null, rslt_rmvl_dtm: now, modr_id: by }).not('rslt_val', 'is', null).lt('exec_end_dtm', old).select('req_id'),
  ])
  for (const x of [a, b, c]) if (x.error) throw x.error
  return { exp: a.data!.length, lease: b.data!.length, rmvl: c.data!.length }
}
