// DDL 서버 직접 실행(서버 전용, 2026-10-18) — PostgreSQL(postgres 패키지)·Oracle(oracledb Thin). Tibero·사내망은 로컬 에이전트
// 접속 : 호스트 DNS 결과 전부를 net-guard 로 검사한 뒤 그 IP 로 고정 접속(DNS 재바인딩 차단), 포트 1024~65535
// PostgreSQL = 한 트랜잭션(실패하면 전부 되돌림 RBK), Oracle = DDL 이 문장마다 자동 커밋이라 문장 단위(실패 지점부터 다음 시도에서 재개 — 이전 시도 성공 문장은 SKIP)
// 오류 메시지는 접속 주소·계정을 가리고 200자로(maskErr) — 원문을 응답·로그에 남기지 않음
// PostgreSQL TLS = 인증서 검증(sslmode=verify-full, 호스트명 = 원래 호스트). 비밀번호가 실리므로 검증 끄기 금지
// 자체 CA(Supabase 등)는 접속 프로파일의 서버 CA 인증서(sql/042)로 검증 — 시스템 신뢰 저장소 대신 그 CA 로만 검증
import 'server-only'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import postgres from 'postgres'
import { ipAllowed, portAllowed } from './modelpi/net-guard'
import { dropTarget } from './modelpi/sql-guard'
import { allowPrivate } from './secret'

export type Rslt = 'OK' | 'ERR' | 'SKIP' | 'RBK'
export interface StmtRes {
  seq: number // 1부터
  txt: string
  rslt: Rslt
  err_cd?: string | null
  err_msg?: string | null
  ms?: number | null
}
export interface Target {
  ip: string
  host: string
  port: number
  db: string
  usr: string
  priv: boolean
  ca: string | null // 서버 CA 인증서(PEM, sql/042) — Supabase 등 자체 CA
}
export const STMT_MS = 20_000 // 문장 1개 제한
export const LOCK_MS = 5_000
// 트랜잭션을 연 채 멈춘 세션(함수 강제 종료·연결 끊김)은 DB 가 이 시간 뒤 끊고 rollback — 잠금이 남지 않게(마스터 강조 2026-10-18)
export const IDLE_TX_MS = 10_000
// Oracle : 서버 쪽 idle 세션 정리(SQLNET.EXPIRE_TIME·프로파일 IDLE_TIME·MAX_IDLE_BLOCKER_TIME)는 DBA 설정 — 앱은 expireTime(분) 탐지 패킷만
export const ORA_EXPIRE_MIN = 1

export function maskErr(msg: unknown, hide: (string | null | undefined)[]): string {
  let s = String(msg ?? '').replace(/\s+/g, ' ')
  for (const h of hide) if (h && h.length >= 2) s = s.split(h).join('***')
  return s.slice(0, 200)
}

// 접속 대상 확인 — 'BLOCKED'(사설·내부·포트) / 'DNS'(이름 풀이 실패)
export async function resolveTarget(c: { host_nm: string | null; port_no: number | null; db_nm: string | null; usr_nm: string | null; ca_cert_txt?: string | null }): Promise<Target | 'BLOCKED' | 'DNS'> {
  if (!c.host_nm || !c.port_no || !c.db_nm || !c.usr_nm) return 'BLOCKED'
  const dev = allowPrivate()
  if (!dev && !portAllowed(c.port_no)) return 'BLOCKED'
  let ips: string[]
  if (isIP(c.host_nm.replace(/^\[|\]$/g, ''))) ips = [c.host_nm.replace(/^\[|\]$/g, '')]
  else {
    try {
      ips = (await lookup(c.host_nm, { all: true, verbatim: true })).map((x) => x.address)
    } catch {
      return 'DNS'
    }
  }
  if (!ips.length) return 'DNS'
  const bad = ips.filter((ip) => !ipAllowed(ip))
  if (bad.length && !dev) return 'BLOCKED' // 하나라도 내부 주소면 거부(재바인딩·혼합 응답)
  return { ip: ips[0], host: c.host_nm, port: c.port_no, db: c.db_nm, usr: c.usr_nm, priv: bad.length > 0, ca: c.ca_cert_txt ?? null }
}

export const pgClient = (t: Target, pwd: string) =>
  postgres({ host: t.ip, port: t.port, database: t.db, username: t.usr, password: pwd, max: 1, connect_timeout: 10, idle_timeout: 5, prepare: false, onnotice: () => {}, ssl: t.priv ? false : { rejectUnauthorized: true, servername: isIP(t.host) ? undefined : t.host, ...(t.ca ? { ca: t.ca } : {}) } }) // 사설 주소(개발 전용 허용)만 평문

// 연결 시험(SELECT 1)
export async function testConn(dbms: string, t: Target, pwd: string): Promise<{ ok: boolean; msg: string }> {
  const hide = [t.host, t.ip, t.usr, t.db, pwd]
  try {
    if (dbms === '0014') {
      const sql = pgClient(t, pwd)
      try {
        await sql`SELECT 1`
      } finally {
        await sql.end({ timeout: 2 })
      }
    } else {
      const ora = (await import('oracledb')).default
      const cn = await ora.getConnection({ user: t.usr, password: pwd, connectString: `${t.ip}:${t.port}/${t.db}`, connectTimeout: 10 })
      try {
        await cn.execute('SELECT 1 FROM DUAL')
      } finally {
        await cn.close()
      }
    }
    return { ok: true, msg: '' }
  } catch (e) {
    return { ok: false, msg: maskErr((e as Error).message, hide) }
  }
}

// PostgreSQL — 한 트랜잭션. 남은 시간이 문장 제한+5초보다 적으면 멈추고 되돌림
export async function runPg(t: Target, pwd: string, stmts: string[], deadline: number): Promise<StmtRes[]> {
  const hide = [t.host, t.ip, t.usr, t.db, pwd]
  const res: StmtRes[] = stmts.map((txt, i) => ({ seq: i + 1, txt, rslt: 'SKIP' }))
  const sql = pgClient(t, pwd)
  let at = -1
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL statement_timeout = ${STMT_MS}`)
      await tx.unsafe(`SET LOCAL lock_timeout = ${LOCK_MS}`)
      await tx.unsafe(`SET LOCAL idle_in_transaction_session_timeout = ${IDLE_TX_MS}`)
      // search_path = 현재 스키마 하나로 고정(트랜잭션 한정) — 한정 없는 DROP 이 search_path 의 다른 스키마 같은 이름 테이블을 CASCADE 로 지우지 않게(CREATE 와 같은 스키마)
      await tx.unsafe(`SELECT set_config('search_path', quote_ident(coalesce(current_schema(), 'public')), true)`)
      for (let i = 0; i < stmts.length; i++) {
        at = i
        if (deadline - Date.now() < STMT_MS + 5_000) throw Object.assign(new Error('실행 시간 예산 초과 — 다시 실행하십시오'), { code: 'EXEC_TIMEOUT' })
        const s0 = Date.now()
        await tx.unsafe(stmts[i])
        res[i] = { ...res[i], rslt: 'OK', ms: Date.now() - s0 }
      }
    })
    return res
  } catch (e) {
    const x = e as { code?: string; message?: string }
    // 트랜잭션 전체 되돌림 — 성공했던 문장은 RBK, 실패 문장(접속 실패면 첫 문장) ERR, 나머지 SKIP
    const bad = Math.max(at, 0)
    return res.map((r, i) => (i === bad && r.rslt !== 'OK' ? { ...r, rslt: 'ERR' as const, err_cd: String(x.code ?? 'ERR').slice(0, 20), err_msg: maskErr(x.message, hide) } : r.rslt === 'OK' ? { ...r, rslt: 'RBK' as const } : r))
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {})
  }
}

// Oracle — 문장 단위 자동 커밋, done(이전 시도 성공 순번)은 건너뜀
export async function runOracle(t: Target, pwd: string, stmts: string[], deadline: number, done: Set<number>): Promise<StmtRes[]> {
  const hide = [t.host, t.ip, t.usr, t.db, pwd]
  const res: StmtRes[] = stmts.map((txt, i) => ({ seq: i + 1, txt, rslt: 'SKIP' }))
  const ora = (await import('oracledb')).default
  let cn: import('oracledb').Connection | null = null
  try {
    cn = await ora.getConnection({ user: t.usr, password: pwd, connectString: `${t.ip}:${t.port}/${t.db}`, connectTimeout: 10, expireTime: ORA_EXPIRE_MIN })
    cn.callTimeout = STMT_MS
    for (let i = 0; i < stmts.length; i++) {
      if (done.has(i + 1)) continue
      if (deadline - Date.now() < STMT_MS + 5_000) break // 남은 문장은 SKIP — 다음 시도에서 이어서
      const s0 = Date.now()
      try {
        await cn.execute(stmts[i], [], { autoCommit: true })
        res[i] = { ...res[i], rslt: 'OK', ms: Date.now() - s0 }
      } catch (e) {
        const x = e as { code?: string; errorNum?: number; message?: string }
        // CREATE 직전 DROP(IF EXISTS 미지원) 의 '테이블 없음'(ORA-00942) = 성공으로 기록 — 재시도에서 DROP 이 다시 돌아 앞서 만든 테이블을 지우지 않게 OK
        if (x.errorNum === 942 && dropTarget(stmts[i])) {
          res[i] = { ...res[i], rslt: 'OK', err_msg: '테이블 없음 — DROP 건너뜀', ms: Date.now() - s0 }
          continue
        }
        res[i] = { ...res[i], rslt: 'ERR', err_cd: String(x.code ?? x.errorNum ?? 'ERR').slice(0, 20), err_msg: maskErr(x.message, hide), ms: Date.now() - s0 }
        break
      }
    }
    return res
  } catch (e) {
    const x = e as { code?: string; message?: string }
    const first = res.findIndex((r) => !done.has(r.seq))
    if (first >= 0) res[first] = { ...res[first], rslt: 'ERR', err_cd: String(x.code ?? 'CONN').slice(0, 20), err_msg: maskErr(x.message, hide) }
    return res
  } finally {
    await cn?.close().catch(() => {})
  }
}
