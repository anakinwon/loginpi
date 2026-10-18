// SQL 편집기 실행(서버 전용, 2026-10-18 마스터 지시 "Universal SQL Editor" — DBeaver 참고). 접속 = 저장된 서버 직접(SRV) 접속만
// 판정 : 서버가 splitSql·classify·danger 를 다시 계산(클라이언트 값 신뢰 안 함) — 트랜잭션 제어 거부, 쓰기 = SQL_WRITE(DA), 위험 문장 = confirm 필요
// PostgreSQL 조회 = 문장마다 READ ONLY 트랜잭션 + SET LOCAL 타임아웃 + SELECT 1(스냅샷 고정 — 이후 transaction_read_only 해제 불가) 후 ROLLBACK
//  행 질의(SELECT·WITH·VALUES·TABLE)는 cursor(확장 프로토콜 — 한 문장만 허용)로 limit 까지만 가져옴. standard_conforming_strings = on 고정(분리기와 같은 문자열 해석)
// 쓰기(DA) 실행 방식(DBeaver Auto/Manual) — 서버리스라 요청 사이 트랜잭션을 열어 둘 수 없어 MANUAL 은 '미리 실행 + Commit 때 재실행'(마스터 결정 2026-10-18)
//  AUTO = 문장마다 커밋 / MANUAL 실행(TRY) = 대기 문장(pending)을 한 트랜잭션 안에서 다시 실행한 뒤 새 문장 실행 → 결과를 보여 주고 항상 되돌림, 오류 없는 쓰기 문장만 대기 목록에 추가(journal)
//  MANUAL Commit(TX) = 대기 문장을 한 트랜잭션으로 다시 실행·커밋(오류면 전체 되돌림), Rollback = 화면의 대기 목록 비움(서버 호출 없음)
//  한계 : Commit 시점 재실행이라 그 사이 다른 변경·now()·시퀀스 값은 달라질 수 있음. Oracle DDL·PL/SQL 블록·CALL 은 안에서 커밋될 수 있어 MANUAL 에서 거부(함수 안 자율 트랜잭션은 못 막음)
// 전체 패치(limit 100000)는 조회 문장만 — 쓰기 재실행 방지. 응답 예산 = 바이트(한글 등 다중 바이트), 가져오는 도중 시간 예산이 다 되면 멈춤(cut TIME)
// 결과 값은 응답으로만 — 이력(mdl_sql_exec_hist)엔 문장·행 수·소요·오류만(READ·WRITE·TRY·CMIT), 실제 반영(AUTO 쓰기·Commit)은 감사 이력(std_audit_log)도
import 'server-only'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from './db'
import { audit, errMsg, type ErrorCode } from './api'
import { can, type MbrRole } from './roles'
import { IDLE_TX_MS, LOCK_MS, maskErr, ORA_EXPIRE_MIN, pgClient, resolveTarget, STMT_MS, type Target } from './db-exec'
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
  cut?: 'ROWS' | 'BYTES' | 'TIME' // 무엇에 걸렸나(행 제한 / 응답 크기 / 시간 예산)
  ms?: number // 문장 전체(실행 + 가져오기)
  fetch_ms?: number // 그중 행 가져오기(첫 묶음 이후)
  err_cd?: string | null
  err_msg?: string | null
}
type Mode = 'READ' | 'AUTO' | 'TX' | 'TRY'
type RunOpt = { mode: Mode; limit: number; schema?: string | null; prefix: Stmt[]; deadline: number }
const MAX_BYTES = 3_500_000 // 응답 결과 값 상한(대략) — Vercel 함수 응답 4.5MB 안
// 잠금 방지(마스터 강조 2026-10-18 "테이블락 방지 — 강제 종료 시 미커밋 전부 rollback") : 요청 사이에 트랜잭션을 열어 두지 않으므로 잠금은 요청 1건 동안만.
//  시간 예산은 요청 도착 시각부터 50초 — 라우트 maxDuration 60초 전에 반드시 커밋·rollback·연결 종료(함수 강제 종료로 트랜잭션이 열린 채 남지 않게)
//  그래도 끊기면 PG 는 idle_in_transaction_session_timeout(IDLE_TX_MS)으로 DB 가 rollback, Oracle 은 expireTime + DBA 서버 설정
const BUDGET_MS = 50_000
const CELL_MAX = 4000
const ALL_ROWS = 100_000 // '전체 패치' — 응답 크기 상한이 먼저 걸릴 수 있음
const PENDING_MAX = 50
const ROWQ = /^[\s(]*(SELECT|WITH|VALUES|TABLE)\b/i
const IDENT = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/
const ORA_DDL = /^[\s(]*(CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|RENAME|COMMENT|ANALYZE|PURGE|FLASHBACK|AUDIT|NOAUDIT|DECLARE|BEGIN|CALL|EXEC(UTE)?)\b/i // Oracle 암묵 커밋 문장 + 안에서 COMMIT·EXECUTE IMMEDIATE 할 수 있는 블록·호출

export const runBody = z.object({
  conn_id: z.string().uuid(),
  sql: z.string().max(200_000).default(''), // Commit 은 비어 있어도 됨
  cursor: z.number().int().min(0).nullable().optional(), // 숫자 = 커서가 든 문장만(Ctrl+Enter), 없음 = 전체(스크립트·선택 영역)
  limit: z.union([z.literal(200), z.literal(500), z.literal(1000), z.literal(5000), z.literal(ALL_ROWS)]).default(200), // 패치 크기, ALL_ROWS = 전체 패치
  schema: z.string().regex(IDENT).nullable().optional(),
  tx: z.enum(['AUTO', 'MANUAL']).default('AUTO'),
  pending: z.array(z.string().min(1).max(100_000)).max(PENDING_MAX).refine((a) => a.reduce((n, x) => n + x.length, 0) <= 1_000_000, '대기 문장 합계는 100만 자까지').default([]), // MANUAL 대기 문장(화면 보관, 서버가 매번 다시 판정) — 합계 상한 = 요청 4.5MB 안
  commit: z.boolean().optional(), // MANUAL Commit — pending 을 한 트랜잭션으로 실행·커밋
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
const RBK = '__RBK'
const pendingErr = (e: unknown) => Object.assign(new Error(`대기 문장 재실행 실패 — Rollback 하십시오 : ${(e as Error).message}`), { code: (e as { code?: string }).code ?? 'PENDING', pending: true })

// 행 모으기 — 행 제한·응답 크기(남은 예산) 중 먼저 걸리는 것까지
function collector(limit: number, budget: { left: number }) {
  const rows: Cell[][] = []
  let cut: RunRes['cut']
  const take = (r: unknown[]) => {
    if (rows.length >= limit) return ((cut = 'ROWS'), false)
    if (budget.left <= 0) return ((cut = 'BYTES'), false)
    const row = r.map(cell)
    budget.left -= Buffer.byteLength(JSON.stringify(row)) // 바이트(한글 3바이트) — Vercel 응답 4.5MB 안
    rows.push(row)
    return true
  }
  return { rows, take, cut: () => cut, stop: (c: NonNullable<RunRes['cut']>) => void (cut = c) }
}
const budgetOf = (stmts: Stmt[]) => ({ left: MAX_BYTES - stmts.reduce((n, s) => n + Buffer.byteLength(s.txt) * 2, 0) }) // 응답에 실리는 문장 글(txt·journal)만큼 덜어 둠

// PostgreSQL 문장 1개 — 행 질의는 cursor, 나머지는 한 번에(.values — 같은 이름 칼럼 유지). fetch_ms = 첫 묶음 이후 가져오기
async function pgOne(q: Q, s: Stmt, limit: number, budget: { left: number }, types: Map<number, string>, deadline: number): Promise<Omit<RunRes, 'seq' | 'txt' | 'kind' | 'rslt' | 'ms'>> {
  let cols: { name: string; type: number }[] | null = null
  const c = collector(limit, budget)
  let affected: number | null = null, first = 0, fetch_ms: number | undefined // 행 질의만 가져오기 시간
  if (ROWQ.test(s.mask)) {
    for await (const chunk of q.unsafe(s.txt).values().cursor(Math.min(limit + 1, 500))) {
      first ||= Date.now()
      cols ??= chunk.columns
      if (Date.now() > deadline - 2_000) { c.stop('TIME'); break } // 응답 시간 예산
      let go = true
      for (const r of chunk) if (!(go = c.take(r))) break
      if (!go) break
    }
    fetch_ms = first ? Date.now() - first : 0
    affected = c.rows.length
    if (!cols) cols = (await q.unsafe(s.txt).describe().catch(() => null))?.columns ?? [] // 0행 — 칼럼만
  } else {
    if (s.mask.includes(';')) throw Object.assign(new Error('한 번에 한 문장만 실행합니다'), { code: 'MULTI' }) // 분리기와 다른 해석 방지
    const r = await q.unsafe(s.txt).values()
    cols = r.columns ?? null
    for (const x of r as unknown[][]) if (!c.take(x)) break
    affected = typeof r.count === 'number' ? r.count : null
  }
  const oids = [...new Set((cols ?? []).map((x) => x.type))].filter((o) => !types.has(o))
  if (oids.length) {
    const t = await q.unsafe('SELECT oid::int AS o, format_type(oid, NULL) AS t FROM pg_type WHERE oid = ANY($1::oid[])', [oids]).catch(() => [])
    for (const x of t as { o: number; t: string }[]) types.set(x.o, x.t)
  }
  const cut = c.cut()
  return { columns: cols ? cols.map((x) => ({ name: x.name, type: types.get(x.type) ?? String(x.type) })) : undefined, rows: cols ? c.rows : undefined, affected, truncated: !!cut, cut, fetch_ms }
}

async function runPg(t: Target, pwd: string, stmts: Stmt[], kinds: Kind[], o: RunOpt): Promise<RunRes[]> {
  const hide = [t.host, t.ip, t.usr, t.db, pwd]
  const res: RunRes[] = stmts.map((s, i) => ({ seq: i + 1, txt: s.txt, kind: kinds[i], rslt: 'SKIP' }))
  const sql = pgClient(t, pwd)
  const budget = budgetOf(stmts), types = new Map<number, string>()
  const setup = async (q: Q, local: boolean) => {
    const L = local ? 'LOCAL ' : ''
    await q.unsafe(`SET ${L}statement_timeout = ${STMT_MS}`)
    await q.unsafe(`SET ${L}lock_timeout = ${LOCK_MS}`)
    await q.unsafe(`SET ${L}idle_in_transaction_session_timeout = ${IDLE_TX_MS}`)
    await q.unsafe(`SET ${L}standard_conforming_strings = on`)
    if (o.schema) await q.unsafe(`SET ${L}search_path TO "${o.schema}"`)
  }
  const late = () => o.deadline - Date.now() < STMT_MS + 1_000
  const errOf = (e: unknown) => { const x = e as { code?: string; message?: string }; return { err_cd: String(x.code ?? 'ERR').slice(0, 20), err_msg: maskErr(x.message, hide) } }
  const one = async (q: Q, i: number) => {
    const s0 = Date.now()
    const r = await pgOne(q, stmts[i], o.limit, budget, types, o.deadline)
    res[i] = { ...res[i], ...r, rslt: 'OK', ms: Date.now() - s0 }
  }
  let at = -1
  try {
    if (o.mode === 'READ') {
      // 조회 전용 — 문장마다 READ ONLY 트랜잭션, 끝나면 되돌림
      for (let i = 0; i < stmts.length; i++) {
        if (late()) { res[i] = { ...res[i], err_cd: 'EXEC_TIMEOUT', err_msg: '실행 시간 예산 초과 — 나머지는 다시 실행하십시오' }; break }
        const s0 = Date.now()
        try {
          await sql.begin('read only', async (tx) => {
            await setup(tx, true)
            await tx.unsafe('SELECT 1') // 스냅샷 고정
            await one(tx, i)
            throw Object.assign(new Error('rollback'), { code: RBK }) // 조회도 항상 되돌림
          }).catch((e) => { if ((e as { code?: string }).code !== RBK) throw e })
        } catch (e) {
          res[i] = { ...res[i], rslt: 'ERR', ms: Date.now() - s0, ...errOf(e) }
          break
        }
      }
      return res
    }
    if (o.mode === 'TX' || o.mode === 'TRY') {
      // 한 트랜잭션 — TRY 는 대기 문장 재실행 후 새 문장, 끝나면 항상 되돌림 / TX(Commit)는 오류 없으면 커밋
      await sql.begin(async (tx) => {
        await setup(tx, true)
        for (const p of o.prefix) {
          if (late()) throw Object.assign(new Error('실행 시간 예산 초과'), { code: 'EXEC_TIMEOUT' })
          await tx.unsafe(p.txt).catch((e: unknown) => { throw pendingErr(e) })
        }
        for (let i = 0; i < stmts.length; i++) {
          at = i
          if (late()) throw Object.assign(new Error('실행 시간 예산 초과 — 전체 되돌림'), { code: 'EXEC_TIMEOUT' })
          await one(tx, i)
        }
        if (o.mode === 'TRY') throw Object.assign(new Error('rollback'), { code: RBK })
      }).catch((e) => { if ((e as { code?: string }).code !== RBK) throw e })
      return res
    }
    // AUTO — 문장마다 커밋, 오류에서 멈춤
    await setup(sql, false)
    for (let i = 0; i < stmts.length; i++) {
      at = i
      if (late()) { res[i] = { ...res[i], err_cd: 'EXEC_TIMEOUT', err_msg: '실행 시간 예산 초과 — 나머지는 다시 실행하십시오' }; break }
      const s0 = Date.now()
      try {
        await one(sql, i)
      } catch (e) {
        res[i] = { ...res[i], rslt: 'ERR', ms: Date.now() - s0, ...errOf(e) }
        break
      }
    }
    return res
  } catch (e) {
    // 접속 실패·대기 문장 재실행 실패·한 트랜잭션 실패 — 성공했던 문장은 RBK, 실패 지점 ERR
    const bad = (e as { pending?: boolean }).pending ? 0 : Math.max(at, 0)
    return res.map((r, i) => (i === bad ? { ...r, rslt: 'ERR' as const, ...errOf(e) } : o.mode !== 'AUTO' && r.rslt === 'OK' ? { ...r, rslt: 'RBK' as const } : r))
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {})
  }
}

async function runOra(t: Target, pwd: string, stmts: Stmt[], kinds: Kind[], o: RunOpt): Promise<RunRes[]> {
  const hide = [t.host, t.ip, t.usr, t.db, pwd]
  const res: RunRes[] = stmts.map((s, i) => ({ seq: i + 1, txt: s.txt, kind: kinds[i], rslt: 'SKIP' }))
  const ora = (await import('oracledb')).default
  const errOf = (e: unknown) => { const x = e as { code?: string; errorNum?: number; message?: string }; return { err_cd: String(x.code ?? x.errorNum ?? 'ERR').slice(0, 20), err_msg: maskErr(x.message, hide) } }
  const fetchTypeHandler = (m: { dbType?: unknown }) => (m.dbType === ora.DB_TYPE_CLOB || m.dbType === ora.DB_TYPE_NCLOB ? { type: ora.STRING } : m.dbType === ora.DB_TYPE_BLOB ? { type: ora.BUFFER } : undefined)
  const budget = budgetOf(stmts)
  const tx = o.mode === 'TX' || o.mode === 'TRY'
  let cn: import('oracledb').Connection | null = null
  try {
    cn = await ora.getConnection({ user: t.usr, password: pwd, connectString: `${t.ip}:${t.port}/${t.db}`, connectTimeout: 10, expireTime: ORA_EXPIRE_MIN })
    cn.callTimeout = STMT_MS
    if (o.schema) await cn.execute(`ALTER SESSION SET CURRENT_SCHEMA = "${o.schema.toUpperCase()}"`)
    for (const p of o.prefix) {
      if (o.deadline - Date.now() < STMT_MS + 1_000) throw pendingErr(Object.assign(new Error('실행 시간 예산 초과'), { code: 'EXEC_TIMEOUT' }))
      await cn.execute(p.txt, [], { autoCommit: false }).catch((e: unknown) => { throw pendingErr(e) })
    }
    for (let i = 0; i < stmts.length; i++) {
      if (o.deadline - Date.now() < STMT_MS + 1_000) { res[i] = { ...res[i], err_cd: 'EXEC_TIMEOUT', err_msg: '실행 시간 예산 초과' }; break }
      const s0 = Date.now()
      try {
        if (o.mode === 'READ') await cn.execute('SET TRANSACTION READ ONLY')
        // 행 질의는 resultSet 으로 500행씩(전체 패치도 메모리에 다 올리지 않음), 가져오기 시간은 따로
        const r = await cn.execute(stmts[i].txt, [], { autoCommit: o.mode === 'AUTO', resultSet: true, fetchArraySize: 500, outFormat: ora.OUT_FORMAT_ARRAY, fetchTypeHandler })
        const c = collector(o.limit, budget)
        let fetch_ms: number | undefined
        if (r.resultSet) {
          const f0 = Date.now()
          try {
            for (;;) {
              if (Date.now() > o.deadline - 2_000) { c.stop('TIME'); break }
              const part = (await r.resultSet.getRows(500)) as unknown[][]
              if (!part.length) break
              let go = true
              for (const x of part) if (!(go = c.take(x))) break
              if (!go) break
            }
          } finally {
            await r.resultSet.close().catch(() => {})
          }
          fetch_ms = Date.now() - f0
        }
        if (o.mode === 'READ') await cn.rollback()
        const cut = c.cut()
        res[i] = { ...res[i], rslt: 'OK', ms: Date.now() - s0, fetch_ms, columns: r.metaData?.map((m) => ({ name: m.name, type: m.dbTypeName ?? '' })), rows: r.metaData ? c.rows : undefined, affected: r.rowsAffected ?? c.rows.length, truncated: !!cut, cut }
      } catch (e) {
        res[i] = { ...res[i], rslt: 'ERR', ms: Date.now() - s0, ...errOf(e) }
        break
      }
    }
    if (tx) {
      const bad = res.some((r) => r.rslt === 'ERR' || r.err_cd)
      if (o.mode === 'TRY' || bad) {
        await cn.rollback().catch(() => {}) // 되돌리기 실패여도 커밋하지 않았으므로 반영 없음(연결 종료 시 롤백)
        return bad ? res.map((r) => (r.rslt === 'OK' ? { ...r, rslt: 'RBK' as const } : r)) : res
      }
      try {
        await cn.commit()
      } catch (e) {
        // 커밋 자체 실패(지연 제약·연결 끊김) — 반영 안 됨 : 마지막 문장에 오류, 나머지 RBK
        const last = res.length - 1
        return res.map((r, i) => (i === last ? { ...r, rslt: 'ERR' as const, ...errOf(e) } : r.rslt === 'OK' ? { ...r, rslt: 'RBK' as const } : r))
      }
    }
    return res
  } catch (e) {
    const first = (e as { pending?: boolean }).pending ? 0 : res.findIndex((r) => r.rslt === 'SKIP')
    if (first >= 0) res[first] = { ...res[first], rslt: 'ERR', ...errOf(e) }
    return res
  } finally {
    if (cn && o.mode !== 'AUTO') await cn.rollback().catch(() => {}) // 커밋 뒤면 되돌릴 것 없음
    await cn?.close().catch(() => {})
  }
}

// 접속 열기 공통(실행·메타) — 같은 분류체계·서버 직접·조회 전용 계정(DA 아니면)·스위치·키·비밀번호·공인 주소 확인
export async function openConn(areaId: string, connId: string, role: MbrRole): Promise<{ c: NonNullable<Awaited<ReturnType<typeof getConn>>>; d: Dialect; t: Target; pwd: string } | NextResponse> {
  const c = await getConn(areaId, connId)
  if (!c) return failRes({ code: 'NOT_FOUND', status: 404 })
  if (c.exec_mthd_cd !== 'SRV') return failRes({ code: 'SQL_AGT_UNSUPPORTED', status: 400 })
  // DA 아닌 역할 = 조회 전용 계정 접속만(fail-closed) — 어휘 판정·READ ONLY 트랜잭션은 사용자 함수 안 부작용을 못 막고, 메타도 그 계정 권한으로 열람
  if (!can(role, 'SQL_WRITE') && c.rdonly_acct_yn !== 'Y') return failRes({ code: 'SQL_RDONLY_REQUIRED', status: 403 })
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
export async function runEditor(areaId: string, uid: string, role: MbrRole, b: Body, startedAt = Date.now()): Promise<NextResponse> {
  const cn = await getConn(areaId, b.conn_id)
  if (!cn) return failRes({ code: 'NOT_FOUND', status: 404 })
  const d: Dialect = cn.dbms_cd === '0001' ? 'ORA' : 'PG' // 판정용(지원 DBMS 확인은 openConn)
  const canWrite = can(role, 'SQL_WRITE')
  const manual = b.tx === 'MANUAL' && canWrite // MANUAL 은 쓰기 권한자만(조회 전용은 언제나 READ)

  // 대기 문장 — 하나씩 정확히 한 문장, 트랜잭션 제어 아님(서버가 매번 다시 판정)
  const prefix: Stmt[] = []
  for (const p of manual ? b.pending : []) {
    const s = splitSql(p, d)
    if (s.length !== 1 || classify(s[0], d) === 'TXN') return failRes({ code: 'INVALID_INPUT', status: 400, detail: '대기 문장이 올바르지 않습니다 — Rollback 하십시오' })
    prefix.push(s[0])
  }
  if (b.commit && (!manual || !prefix.length)) return failRes({ code: 'INVALID_INPUT', status: 400, detail: '커밋할 대기 문장이 없습니다' })

  const all = b.commit ? prefix : splitSql(b.sql, d)
  const stmts = b.commit || b.cursor == null ? all : [stmtAt(all, b.cursor)].filter((s): s is Stmt => !!s)
  if (!stmts.length || stmts.length > 100) return failRes({ code: 'INVALID_INPUT', status: 400, detail: stmts.length ? '한 번에 100문장까지 실행합니다' : '실행할 문장이 없습니다' })
  const kinds = stmts.map((s) => classify(s, d))
  const txn = kinds.findIndex((k) => k === 'TXN')
  if (txn >= 0) return failRes({ code: 'SQL_TXN_DENIED', status: 400, detail: { seq: txn + 1, txt: stmts[txn].txt.slice(0, 200) } })
  const write = kinds.includes('WRITE')
  if (write && !canWrite) return failRes({ code: 'SQL_WRITE_DENIED', status: 403, detail: { seq: kinds.indexOf('WRITE') + 1, txt: stmts[kinds.indexOf('WRITE')].txt.slice(0, 200) } })
  if (b.limit === ALL_ROWS && write) return failRes({ code: 'INVALID_INPUT', status: 400, detail: '전체 패치는 조회 문장만 다시 실행합니다' })
  if (manual && !b.commit && write) {
    const nw = stmts.filter((_, i) => kinds[i] === 'WRITE')
    if (prefix.length + nw.length > PENDING_MAX) return failRes({ code: 'INVALID_INPUT', status: 400, detail: `대기 문장은 ${PENDING_MAX}개까지 — Commit 또는 Rollback 한 뒤 실행하십시오` })
    if (nw.some((s) => s.txt.length > 100_000)) return failRes({ code: 'INVALID_INPUT', status: 400, detail: 'MANUAL 대기 문장은 10만 자까지입니다' })
  }
  if (manual && d === 'ORA') {
    const ddl = [...prefix, ...stmts].find((s) => ORA_DDL.test(s.mask))
    if (ddl) return failRes({ code: 'SQL_MANUAL_ORA_DDL', status: 400, detail: ddl.txt.slice(0, 200) })
  }
  if (!b.commit) {
    const dangers = stmts.map((s, i) => ({ seq: i + 1, txt: s.txt.slice(0, 200), danger: danger(s) })).filter((x): x is { seq: number; txt: string; danger: Danger } => !!x.danger)
    if (dangers.length && !b.confirm) return failRes({ code: 'SQL_CONFIRM', status: 409, detail: dangers })
  } else if (!b.confirm) return failRes({ code: 'SQL_CONFIRM', status: 409, detail: prefix.map((s, i) => ({ seq: i + 1, txt: s.txt.slice(0, 200), danger: danger(s) })) })

  // 방식 — Commit = TX, MANUAL 에서 쓰기가 있거나 대기 문장이 있으면 TRY(대기 변경이 보이게), 쓰기 = AUTO, 그 밖 = READ
  const mode: Mode = b.commit ? 'TX' : manual && (write || prefix.length) ? 'TRY' : write ? 'AUTO' : 'READ'
  const histMode = mode === 'TX' ? 'CMIT' : mode === 'TRY' ? 'TRY' : mode === 'AUTO' ? 'WRITE' : 'READ'

  const oc = await openConn(areaId, b.conn_id, role)
  if (oc instanceof NextResponse) return oc
  const { c, t, pwd } = oc

  // 이력 선기록(fail-closed) — 기록이 안 되면 실행하지 않음, 끝나면 결과로 갱신(중단되면 err_cd RUN 으로 남음)
  const sqlTxt = stmts.map((s) => s.txt).join(';\n').slice(0, 4000)
  const h = await db().from('mdl_sql_exec_hist').insert({ area_id: areaId, conn_id: c.conn_id, usr_id: uid, sql_txt: sqlTxt, stmt_cnt: stmts.length, exec_mode_cd: histMode, rslt_cd: 'ERR', err_cd: 'RUN', regr_id: uid, modr_id: uid }).select('sql_exec_id').single()
  if (h.error) throw h.error
  const t0 = Date.now()
  const o: RunOpt = { mode, limit: b.limit, schema: b.schema, prefix: mode === 'TRY' ? prefix : [], deadline: startedAt + BUDGET_MS } // 요청 도착 기준
  const results = d === 'PG' ? await runPg(t, pwd, stmts, kinds, o) : await runOra(t, pwd, stmts, kinds, o)
  const ms = Date.now() - t0
  for (const r of results) if (r.err_msg) r.err_msg = tlsHint(r.err_msg)

  const okN = results.filter((r) => r.rslt === 'OK').length
  const firstErr = results.find((r) => r.rslt === 'ERR' || r.err_cd)
  const rslt = !firstErr ? 'OK' : okN && mode === 'AUTO' ? 'PART' : 'ERR'
  const rowCnt = results.reduce((n, r) => n + (r.rslt === 'OK' ? (r.affected ?? 0) : 0), 0)
  const u = await db().from('mdl_sql_exec_hist').update({ rslt_cd: rslt, row_cnt: rowCnt, elapsed_ms: ms, err_cd: firstErr?.err_cd?.slice(0, 20) ?? null, err_msg: firstErr?.err_msg?.slice(0, 200) ?? null, modr_id: uid }).eq('sql_exec_id', h.data.sql_exec_id)
  if (u.error) console.error('[sql-hist]', u.error.code, u.error.message) // 선기록은 남아 있음(err_cd RUN)
  if (mode === 'AUTO' || mode === 'TX') await audit({ area_id: areaId, tgt_tp_cd: 'SQL', tgt_id: h.data.sql_exec_id, act_cd: 'UPD', aftr_val: { conn_id: c.conn_id, conn_nm: c.conn_nm, sql: sqlTxt.slice(0, 1000), rslt, affected: rowCnt, mode, confirm: !!b.confirm }, usr_id: uid })
  // MANUAL 미리 실행이 전부 성공했을 때만 쓰기 문장을 대기 목록에 추가(오류면 이번 실행분은 버림 — 실제 세션의 트랜잭션 중단과 같은 결과)
  const journal = mode === 'TRY' && !firstErr ? stmts.filter((_, i) => kinds[i] === 'WRITE').map((s) => s.txt) : []
  return NextResponse.json({ ok: true, mode, rslt, ms, at: new Date().toISOString(), journal, results })
}
