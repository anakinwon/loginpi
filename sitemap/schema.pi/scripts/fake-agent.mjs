// 가짜 로컬 에이전트(개발 시험 전용, 2026-11-07) — SQL 편집기 에이전트 중계(sql/078) 서버 경로를 Java 에이전트 없이 재현 : claim 폴링 → 로컬 PostgreSQL 에서 지시서 실행 → 결과 업로드
// 사용 : SCHEMAPI_URL=http://localhost:3002 SCHEMAPI_AGENT_TOKEN=spa_… LOCAL_PG_URL=postgres://… node scripts/fake-agent.mjs [옵션]
//   --ua 1.3.0(구버전 → SQL 큐 건너뜀) · --nonce bad(일회값 불일치 → 404) · --big(4MB 초과 → 대조 통과 시 FAIL RSLT_SIZE, 화면 413) · --sleep 50(업로드 전 50초 → TIMEOUT) · --once(1건 처리 후 종료)
//   --no-run(폴링 1회 후 종료 — 최종 확인 일시만 갱신, 그 뒤 60초 안에 화면에서 실행하면 아무도 안 가져가 45초 뒤 NO_PICKUP. 1.4.0 이상 폴링은 대기 요청이 있으면 서버가 바로 가져가게 하므로 '폴링하되 안 가져감'은 없음)
//   --claim-only(가져가기만 하고 업로드 안 함 → 화면 TIMEOUT, 120초 뒤 cron 이 FAIL LEASE_EXP)
// DDL 작업(job)·접속 시험(test)은 실행하지 않고 표시만 한다. 토큰·주소는 환경변수로만(출력하지 않음)
import postgres from 'postgres'

const A = process.argv.slice(2)
const opt = (k) => { const i = A.indexOf(`--${k}`); return i < 0 ? null : A[i + 1] && !A[i + 1].startsWith('--') ? A[i + 1] : true }
const BASE = process.env.SCHEMAPI_URL ?? 'http://localhost:3002'
const TKN = process.env.SCHEMAPI_AGENT_TOKEN
const PG_URL = process.env.LOCAL_PG_URL
if (!TKN || !PG_URL) { console.error('SCHEMAPI_AGENT_TOKEN·LOCAL_PG_URL 환경변수가 필요합니다'); process.exit(2) }
const UA = `schemapi-agent/${opt('ua') === true || !opt('ua') ? '1.4.0' : opt('ua')}`
const H = { authorization: `Bearer ${TKN}`, 'user-agent': UA, 'content-type': 'application/json' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 문장 1개 — 행 질의는 limit 까지, 쓰기는 반영 행 수
async function one(q, s, limit) {
  const t0 = Date.now()
  const r = await q.unsafe(s.txt).values()
  const cols = (r.columns ?? []).map((c) => ({ name: c.name, type: String(c.type) }))
  const rows = cols.length ? r.slice(0, limit).map((x) => x.map((v) => (v == null || typeof v === 'number' || typeof v === 'boolean' ? v : typeof v === 'bigint' ? v.toString() : v instanceof Date ? v.toISOString() : String(v).slice(0, 4000)))) : undefined
  return { seq: s.seq, rslt: 'OK', columns: cols.length ? cols : undefined, rows, affected: cols.length ? rows.length : r.count ?? null, truncated: cols.length ? r.length > limit : false, cut: cols.length && r.length > limit ? 'ROWS' : undefined, ms: Date.now() - t0 }
}
const errOf = (s, e) => ({ seq: s.seq, rslt: 'ERR', err_cd: String(e.code ?? 'ERR').slice(0, 20), err_msg: String(e.message ?? e).slice(0, 2000) })

async function exec(job) {
  const v = job.req
  const sql = postgres(PG_URL, { max: 1, onnotice: () => {} })
  try {
    const set = async (q) => { await q.unsafe(`SET LOCAL statement_timeout = ${v.stmt_timeout_ms}`); if (v.lock_timeout_ms) await q.unsafe(`SET LOCAL lock_timeout = ${v.lock_timeout_ms}`); if (v.schema) await q.unsafe(`SET LOCAL search_path TO "${v.schema}"`) }
    if (v.tp === 'META') {
      const rows = await sql.begin('read only', async (tx) => { await tx.unsafe(`SET LOCAL statement_timeout = ${v.stmt_timeout_ms}`); return tx.unsafe(v.sql, v.binds).values() })
      return { final: 'DONE', results: [{ seq: 1, rslt: 'OK', columns: rows.columns.map((c) => ({ name: c.name, type: String(c.type) })), rows: rows.slice(0, v.max_rows) }] }
    }
    const out = []
    if (v.mode === 'READ' || v.mode === 'AUTO') {
      for (const s of v.stmts) {
        try {
          out.push(await sql.begin(v.mode === 'READ' ? 'read only' : 'read write', async (tx) => { await set(tx); const r = await one(tx, s, v.limit); if (v.mode === 'READ') throw Object.assign(new Error('rb'), { rb: r }); return r }).catch((e) => { if (e.rb) return e.rb; throw e }))
        } catch (e) { out.push(errOf(s, e)); break }
      }
      return { final: out.some((r) => r.rslt === 'ERR') ? 'FAIL' : 'DONE', results: out }
    }
    // TX(Commit)·TRY(미리 실행) — 한 트랜잭션, TRY 는 항상 되돌림, 오류면 성공분 RBK
    try {
      await sql.begin(async (tx) => {
        await set(tx)
        for (const p of v.prefix) await tx.unsafe(p)
        for (const s of v.stmts) { try { out.push(await one(tx, s, v.limit)) } catch (e) { out.push(errOf(s, e)); throw e } }
        if (v.mode === 'TRY') throw Object.assign(new Error('rb'), { try: true })
      })
    } catch (e) {
      if (!e.try) return { final: 'FAIL', results: out.map((r) => (r.rslt === 'OK' ? { ...r, rslt: 'RBK' } : r)) }
    }
    return { final: 'DONE', results: out }
  } catch (e) {
    return { final: 'FAIL', err_cd: String(e.code ?? 'CONN').slice(0, 20), err_msg: String(e.message ?? e).slice(0, 2000), results: [] }
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {})
  }
}

for (;;) {
  const r = await fetch(`${BASE}/api/agent/jobs/claim`, { method: 'POST', headers: H, body: '{}' })
  if (opt('no-run')) { console.log('[no-run] 폴링 1회 :', r.status, r.status === 200 ? '— 대기 요청이 있어 서버가 이미 가져감(RUN), 시험을 다시 하십시오' : '— 종료'); break }
  if (r.status === 204) { await sleep(1000); continue }
  const j = await r.json().catch(() => ({}))
  if (!r.ok) { console.log('[claim]', r.status, j.code ?? ''); await sleep(3000); continue }
  if (!j.sql) { console.log('[claim] SQL 아님(실행 안 함) :', j.test ? 'test' : j.job ? 'job' : '?'); await sleep(1000); continue }
  const job = j.sql
  console.log('[claim] sql', job.req_id, job.req.tp, job.req.mode ?? job.req.node, 'budget_ms', job.budget_ms)
  if (opt('claim-only')) { console.log('[claim-only] 업로드 안 함 — 화면 TIMEOUT, 점유 만료(LEASE_EXP) 대기'); if (opt('once')) break; continue }
  const res = await exec(job)
  if (opt('big')) res.results = [{ seq: 1, rslt: 'OK', columns: [{ name: 'x', type: 'text' }], rows: Array.from({ length: 1100 }, () => ['x'.repeat(4000)]) }]
  if (opt('sleep')) await sleep(Number(opt('sleep')) * 1000)
  const body = { run_nonce: opt('nonce') === 'bad' ? 'f'.repeat(32) : job.run_nonce, ...res }
  const u = await fetch(`${BASE}/api/agent/sql/${job.req_id}/result`, { method: 'POST', headers: H, body: JSON.stringify(body) })
  console.log('[result]', u.status, (await u.json().catch(() => ({}))).code ?? 'ok', res.final, res.results.map((x) => `${x.seq}:${x.rslt}`).join(' '))
  if (opt('once')) break
}
