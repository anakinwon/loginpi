// SQL 편집기 실행(서버 전용, 2026-10-18 마스터 지시 "Universal SQL Editor" — DBeaver 참고). 접속 = 저장된 서버 직접(SRV) 접속만
// 판정 : 서버가 splitSql·classify·danger 를 다시 계산(클라이언트 값 신뢰 안 함) — 트랜잭션 제어 거부, 쓰기 = SQL_WRITE(DA), 위험 문장 = confirm 필요
// PostgreSQL 조회 = 문장마다 READ ONLY 트랜잭션 + SET LOCAL 타임아웃 + SELECT 1(스냅샷 고정 — 이후 transaction_read_only 해제 불가) 후 ROLLBACK
//  행 질의(SELECT·WITH·VALUES·TABLE)는 cursor(확장 프로토콜 — 한 문장만 허용)로 limit 까지만 가져옴. standard_conforming_strings = on 고정(분리기와 같은 문자열 해석)
// 쓰기(DA) = Auto(문장마다 커밋, DBeaver 기본) 또는 한 트랜잭션(오류 시 전체 되돌림). 서버리스라 요청 사이 트랜잭션 유지(수동 Commit/Rollback) 없음
// 결과 값은 응답으로만 — 이력(mdl_sql_exec_hist)엔 문장·행 수·소요·오류만, 쓰기는 감사 이력(std_audit_log)도
import 'server-only'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from './db'
import { audit, errMsg, type ErrorCode } from './api'
import { can, type MbrRole } from './roles'
import { LOCK_MS, maskErr, pgClient, resolveTarget, STMT_MS, type Target } from './db-exec'
import { directEnabled, openPwd, profileKey } from './secret'
import { getConn, tlsHint } from './model-ddl-req'
import { classify, danger, splitSql, stmtAt, type Danger, type Dialect, type Kind, type Stmt } from './modelpi/sql-split'

export type Cell = string | number | boolean | null
export type Col = { name: string; type: string }
export interface RunRes {
  seq: number
  txt: string
  kind: Kind
  rslt: 'OK' | 'ERR' | 'SKIP' | 'RBK'
  columns?: Col[]
  rows?: Cell[][]
  affected?: number | null // 반영 행 수(쓰기) / 가져온 행 수(조회)
  truncated?: boolean // 행 제한·응답 크기에 걸려 더 있음
  ms?: number
  err_cd?: string | null
  err_msg?: string | null
}
const MAX_BYTES = 4_000_000 // 응답 결과 값 상한(대략)
const BUDGET_MS = 55_000 // 라우트 maxDuration 60초 안
const CELL_MAX = 4000
const ROWQ = /^[\s(]*(SELECT|WITH|VALUES|TABLE)\b/i
const IDENT = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/

export const runBody = z.object({
  conn_id: z.string().uuid(),
  sql: z.string().min(1).max(200_000),
  cursor: z.number().int().min(0).nullable().optional(), // 숫자 = 커서가 든 문장만(Ctrl+Enter), 없음 = 전체(스크립트·선택 영역)
  limit: z.union([z.literal(200), z.literal(1000), z.literal(5000)]).default(200),
  schema: z.string().regex(IDENT).nullable().optional(),
  one_tx: z.boolean().optional(),
  confirm: z.boolean().optional(),
})
type Body = z.infer<typeof runBody>

// 값 직렬화 — bigint·numeric 문자열(정밀도), 날짜 ISO, 이진 앞 64바이트, 객체 JSON, 긴 글은 자름
export function cell(v: unknown): Cell {
  if (v == null) return null
  if (typeof v === 'string') return v.length > CELL_MAX ? v.slice(0, CELL_MAX) + '…' : v
  if (typeof v === 'number' || typeof v === 'boolean') return v
  if (typeof v === 'bigint') return v.toString()
  if (v instanceof Date) return isNaN(v.getTime()) ? String(v) : v.toISOString()
  if (v instanceof Uint8Array) return '\\x' + Buffer.from(v.subarray(0, 64)).toString('hex') + (v.length > 64 ? `… (${v.length} bytes)` : '')
  try {
    return cell(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x)))
  } catch {
    return String(v)
  }
}

type Fail = { code: ErrorCode; status: number; detail?: unknown }
const failRes = (f: Fail) => NextResponse.json({ ok: false, code: f.code, message: errMsg(f.code), detail: f.detail }, { status: f.status })
type Pg = ReturnType<typeof pgClient>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = Pg | any // 트랜잭션 객체(postgres TransactionSql)도 같은 unsafe 사용

// PostgreSQL 문장 1개 — 행 질의는 cursor, 나머지는 한 번에(.values — 같은 이름 칼럼 유지)
async function pgOne(q: Q, s: Stmt, limit: number, budget: { left: number }, types: Map<number, string>): Promise<Omit<RunRes, 'seq' | 'txt' | 'kind' | 'rslt'>> {
  let cols: { name: string; type: number }[] | null = null
  const rows: Cell[][] = []
  let truncated = false, affected: number | null = null
  const take = (r: unknown[]) => {
    if (rows.length >= limit || budget.left <= 0) { truncated = true; return false }
    const row = r.map(cell)
    budget.left -= JSON.stringify(row).length
    rows.push(row)
    return true
  }
  if (ROWQ.test(s.mask)) {
    for await (const chunk of q.unsafe(s.txt).values().cursor(Math.min(limit + 1, 500))) {
      cols ??= chunk.columns
      let go = true
      for (const r of chunk) if (!(go = take(r))) break
      if (!go) break
    }
    affected = rows.length
    if (!cols) cols = (await q.unsafe(s.txt).describe().catch(() => null))?.columns ?? [] // 0행 — 칼럼만
  } else {
    if (s.mask.includes(';')) throw Object.assign(new Error('한 번에 한 문장만 실행합니다'), { code: 'MULTI' }) // 분리기와 다른 해석 방지
    const r = await q.unsafe(s.txt).values()
    cols = r.columns ?? null
    for (const x of r as unknown[][]) if (!take(x)) break
    affected = typeof r.count === 'number' ? r.count : null
  }
  const oids = [...new Set((cols ?? []).map((c) => c.type))].filter((o) => !types.has(o))
  if (oids.length) {
    const t = await q.unsafe('SELECT oid::int AS o, format_type(oid, NULL) AS t FROM pg_type WHERE oid = ANY($1::oid[])', [oids]).catch(() => [])
    for (const x of t as { o: number; t: string }[]) types.set(x.o, x.t)
  }
  return { columns: cols ? cols.map((c) => ({ name: c.name, type: types.get(c.type) ?? String(c.type) })) : undefined, rows: cols ? rows : undefined, affected, truncated }
}

async function runPg(t: Target, pwd: string, stmts: Stmt[], kinds: Kind[], o: { write: boolean; limit: number; schema?: string | null; oneTx?: boolean; deadline: number }): Promise<RunRes[]> {
  const hide = [t.host, t.ip, t.usr, t.db, pwd]
  const res: RunRes[] = stmts.map((s, i) => ({ seq: i + 1, txt: s.txt, kind: kinds[i], rslt: 'SKIP' }))
  const sql = pgClient(t, pwd)
  const budget = { left: MAX_BYTES }, types = new Map<number, string>()
  const setup = async (q: Q, local: boolean) => {
    const L = local ? 'LOCAL ' : ''
    await q.unsafe(`SET ${L}statement_timeout = ${STMT_MS}`)
    await q.unsafe(`SET ${L}lock_timeout = ${LOCK_MS}`)
    await q.unsafe(`SET ${L}standard_conforming_strings = on`)
    if (o.schema) await q.unsafe(`SET ${L}search_path TO "${o.schema}"`)
  }
  const errOf = (e: unknown) => { const x = e as { code?: string; message?: string }; return { err_cd: String(x.code ?? 'ERR').slice(0, 20), err_msg: maskErr(x.message, hide) } }
  let at = -1
  try {
    if (!o.write) {
      // 조회 전용 — 문장마다 READ ONLY 트랜잭션, 끝나면 되돌림
      for (let i = 0; i < stmts.length; i++) {
        if (o.deadline - Date.now() < STMT_MS + 1_000) { res[i] = { ...res[i], err_cd: 'EXEC_TIMEOUT', err_msg: '실행 시간 예산 초과 — 나머지는 다시 실행하십시오' }; break }
        const s0 = Date.now()
        try {
          let out: Awaited<ReturnType<typeof pgOne>> | null = null
          await sql.begin('read only', async (tx) => {
            await setup(tx, true)
            await tx.unsafe('SELECT 1') // 스냅샷 고정
            out = await pgOne(tx, stmts[i], o.limit, budget, types)
            throw Object.assign(new Error('rollback'), { code: '__RBK' }) // 조회도 항상 되돌림
          }).catch((e) => { if ((e as { code?: string }).code !== '__RBK') throw e })
          res[i] = { ...res[i], ...out!, rslt: 'OK', ms: Date.now() - s0 }
        } catch (e) {
          res[i] = { ...res[i], rslt: 'ERR', ms: Date.now() - s0, ...errOf(e) }
          break
        }
      }
      return res
    }
    if (o.oneTx) {
      await sql.begin(async (tx) => {
        await setup(tx, true)
        for (let i = 0; i < stmts.length; i++) {
          at = i
          if (o.deadline - Date.now() < STMT_MS + 1_000) throw Object.assign(new Error('실행 시간 예산 초과 — 전체 되돌림'), { code: 'EXEC_TIMEOUT' })
          const s0 = Date.now()
          res[i] = { ...res[i], ...(await pgOne(tx, stmts[i], o.limit, budget, types)), rslt: 'OK', ms: Date.now() - s0 }
        }
      })
      return res
    }
    // Auto — 문장마다 커밋, 오류에서 멈춤
    await setup(sql, false)
    for (let i = 0; i < stmts.length; i++) {
      at = i
      if (o.deadline - Date.now() < STMT_MS + 1_000) { res[i] = { ...res[i], err_cd: 'EXEC_TIMEOUT', err_msg: '실행 시간 예산 초과 — 나머지는 다시 실행하십시오' }; break }
      const s0 = Date.now()
      try {
        res[i] = { ...res[i], ...(await pgOne(sql, stmts[i], o.limit, budget, types)), rslt: 'OK', ms: Date.now() - s0 }
      } catch (e) {
        res[i] = { ...res[i], rslt: 'ERR', ms: Date.now() - s0, ...errOf(e) }
        break
      }
    }
    return res
  } catch (e) {
    // 접속 실패 또는 한 트랜잭션 실패 — 성공했던 문장은 RBK(한 트랜잭션), 실패 지점 ERR
    const bad = Math.max(at, 0)
    return res.map((r, i) => (i === bad ? { ...r, rslt: 'ERR' as const, ...errOf(e) } : o.oneTx && r.rslt === 'OK' ? { ...r, rslt: 'RBK' as const } : r))
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {})
  }
}

async function runOra(t: Target, pwd: string, stmts: Stmt[], kinds: Kind[], o: { write: boolean; limit: number; schema?: string | null; oneTx?: boolean; deadline: number }): Promise<RunRes[]> {
  const hide = [t.host, t.ip, t.usr, t.db, pwd]
  const res: RunRes[] = stmts.map((s, i) => ({ seq: i + 1, txt: s.txt, kind: kinds[i], rslt: 'SKIP' }))
  const ora = (await import('oracledb')).default
  const errOf = (e: unknown) => { const x = e as { code?: string; errorNum?: number; message?: string }; return { err_cd: String(x.code ?? x.errorNum ?? 'ERR').slice(0, 20), err_msg: maskErr(x.message, hide) } }
  const fetchTypeHandler = (m: { dbType?: unknown }) => (m.dbType === ora.DB_TYPE_CLOB || m.dbType === ora.DB_TYPE_NCLOB ? { type: ora.STRING } : m.dbType === ora.DB_TYPE_BLOB ? { type: ora.BUFFER } : undefined)
  let budget = MAX_BYTES
  let cn: import('oracledb').Connection | null = null
  try {
    cn = await ora.getConnection({ user: t.usr, password: pwd, connectString: `${t.ip}:${t.port}/${t.db}`, connectTimeout: 10 })
    cn.callTimeout = STMT_MS
    if (o.schema) await cn.execute(`ALTER SESSION SET CURRENT_SCHEMA = "${o.schema.toUpperCase()}"`)
    for (let i = 0; i < stmts.length; i++) {
      if (o.deadline - Date.now() < STMT_MS + 1_000) { res[i] = { ...res[i], err_cd: 'EXEC_TIMEOUT', err_msg: '실행 시간 예산 초과' }; break }
      const s0 = Date.now()
      try {
        if (!o.write) await cn.execute('SET TRANSACTION READ ONLY')
        const r = await cn.execute(stmts[i].txt, [], { autoCommit: o.write && !o.oneTx, maxRows: o.limit + 1, outFormat: ora.OUT_FORMAT_ARRAY, fetchTypeHandler })
        if (!o.write) await cn.rollback()
        const rows: Cell[][] = []
        let truncated = false
        for (const x of (r.rows ?? []) as unknown[][]) {
          if (rows.length >= o.limit || budget <= 0) { truncated = true; break }
          const row = x.map(cell)
          budget -= JSON.stringify(row).length
          rows.push(row)
        }
        res[i] = { ...res[i], rslt: 'OK', ms: Date.now() - s0, columns: r.metaData?.map((m) => ({ name: m.name, type: m.dbTypeName ?? '' })), rows: r.metaData ? rows : undefined, affected: r.rowsAffected ?? rows.length, truncated }
      } catch (e) {
        res[i] = { ...res[i], rslt: 'ERR', ms: Date.now() - s0, ...errOf(e) }
        break
      }
    }
    if (o.write && o.oneTx) {
      if (res.some((r) => r.rslt === 'ERR' || r.err_cd)) {
        await cn.rollback()
        return res.map((r) => (r.rslt === 'OK' ? { ...r, rslt: 'RBK' as const } : r))
      }
      await cn.commit()
    }
    return res
  } catch (e) {
    const first = res.findIndex((r) => r.rslt === 'SKIP')
    if (first >= 0) res[first] = { ...res[first], rslt: 'ERR', ...errOf(e) }
    return res
  } finally {
    if (cn && !o.write) await cn.rollback().catch(() => {})
    await cn?.close().catch(() => {})
  }
}

// 접속 열기 공통(실행·메타) — 같은 분류체계·서버 직접·스위치·키·비밀번호·공인 주소 확인
export async function openConn(areaId: string, connId: string): Promise<{ c: NonNullable<Awaited<ReturnType<typeof getConn>>>; d: Dialect; t: Target; pwd: string } | NextResponse> {
  const c = await getConn(areaId, connId)
  if (!c) return failRes({ code: 'NOT_FOUND', status: 404 })
  if (c.exec_mthd_cd !== 'SRV') return failRes({ code: 'SQL_AGT_UNSUPPORTED', status: 400 })
  if (!directEnabled() || !profileKey()) return failRes({ code: 'DB_CONN_DISABLED', status: 503 })
  const d: Dialect | null = c.dbms_cd === '0014' ? 'PG' : c.dbms_cd === '0001' ? 'ORA' : null
  if (!d) return failRes({ code: 'DB_CONN_MISMATCH', status: 400 })
  const pwd = c.pwd_enc_txt ? openPwd(areaId, c.conn_id, c.pwd_enc_txt) : null
  if (pwd == null) return failRes({ code: 'DB_CONN_FAIL', status: 400, detail: '저장된 비밀번호를 열 수 없습니다 — 접속 관리에서 비밀번호를 다시 입력하십시오' })
  const t = await resolveTarget(c)
  if (t === 'BLOCKED') return failRes({ code: 'DB_CONN_BLOCKED', status: 400 })
  if (t === 'DNS') return failRes({ code: 'DB_CONN_FAIL', status: 400, detail: '호스트 이름을 찾을 수 없습니다' })
  return { c, d, t, pwd }
}

// 실행 요청 처리 — 권한·접속·판정 → 실행 → 이력·감사
export async function runEditor(areaId: string, uid: string, role: MbrRole, b: Body): Promise<NextResponse> {
  const cn = await getConn(areaId, b.conn_id)
  if (!cn) return failRes({ code: 'NOT_FOUND', status: 404 })
  const d: Dialect = cn.dbms_cd === '0001' ? 'ORA' : 'PG' // 판정용(지원 DBMS 확인은 openConn)

  const all = splitSql(b.sql, d)
  const stmts = b.cursor == null ? all : [stmtAt(all, b.cursor)].filter((s): s is Stmt => !!s)
  if (!stmts.length || stmts.length > 100) return failRes({ code: 'INVALID_INPUT', status: 400, detail: stmts.length ? '한 번에 100문장까지 실행합니다' : '실행할 문장이 없습니다' })
  const kinds = stmts.map((s) => classify(s, d))
  const txn = kinds.findIndex((k) => k === 'TXN')
  if (txn >= 0) return failRes({ code: 'SQL_TXN_DENIED', status: 400, detail: { seq: txn + 1, txt: stmts[txn].txt.slice(0, 200) } })
  const write = kinds.includes('WRITE')
  if (write && !can(role, 'SQL_WRITE')) return failRes({ code: 'SQL_WRITE_DENIED', status: 403, detail: { seq: kinds.indexOf('WRITE') + 1, txt: stmts[kinds.indexOf('WRITE')].txt.slice(0, 200) } })
  const dangers = stmts.map((s, i) => ({ seq: i + 1, txt: s.txt.slice(0, 200), danger: danger(s) })).filter((x): x is { seq: number; txt: string; danger: Danger } => !!x.danger)
  if (dangers.length && !b.confirm) return failRes({ code: 'SQL_CONFIRM', status: 409, detail: dangers })

  const oc = await openConn(areaId, b.conn_id)
  if (oc instanceof NextResponse) return oc
  const { c, t, pwd } = oc

  const t0 = Date.now()
  const o = { write, limit: b.limit, schema: b.schema, oneTx: b.one_tx, deadline: t0 + BUDGET_MS }
  const results = d === 'PG' ? await runPg(t, pwd, stmts, kinds, o) : await runOra(t, pwd, stmts, kinds, o)
  const ms = Date.now() - t0
  for (const r of results) if (r.err_msg) r.err_msg = tlsHint(r.err_msg)

  const okN = results.filter((r) => r.rslt === 'OK').length
  const firstErr = results.find((r) => r.rslt === 'ERR' || r.err_cd)
  const rslt = !firstErr ? 'OK' : okN && !o.oneTx ? 'PART' : 'ERR'
  const rowCnt = results.reduce((n, r) => n + (r.rslt === 'OK' ? (r.affected ?? 0) : 0), 0)
  const sqlTxt = stmts.map((s) => s.txt).join(';\n').slice(0, 4000)
  const h = await db().from('mdl_sql_exec_hist').insert({ area_id: areaId, conn_id: c.conn_id, usr_id: uid, sql_txt: sqlTxt, stmt_cnt: stmts.length, exec_mode_cd: write ? 'WRITE' : 'READ', rslt_cd: rslt, row_cnt: rowCnt, elapsed_ms: ms, err_cd: firstErr?.err_cd ?? null, err_msg: firstErr?.err_msg ?? null, regr_id: uid, modr_id: uid }).select('sql_exec_id').single()
  if (h.error) console.error('[sql-hist]', h.error.code, h.error.message)
  if (write) await audit({ area_id: areaId, tgt_tp_cd: 'SQL', tgt_id: h.data?.sql_exec_id ?? c.conn_id, act_cd: 'UPD', aftr_val: { conn_id: c.conn_id, conn_nm: c.conn_nm, sql: sqlTxt.slice(0, 1000), rslt, affected: rowCnt, one_tx: !!o.oneTx, confirm: !!b.confirm }, usr_id: uid })
  return NextResponse.json({ ok: true, mode: write ? 'WRITE' : 'READ', rslt, ms, results })
}
