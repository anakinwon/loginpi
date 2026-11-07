// SQL 편집기 에이전트 중계 순수 로직(2026-11-07, sql/078) — 지시서(req_val) 생성·게이트 판정·대기 기한·결과 재결합(서버 전용 기능 없음 → 단위 테스트 대상)
// DB 왕복·대기 루프는 src/lib/sql-agent.ts, 실행 판정(권한·문장)은 src/lib/sql-run.ts runEditor 가 끝낸 뒤 여기서 지시서로 만든다
// 실행 : pnpm test (test/sql-agent.test.ts)
import { z } from 'zod'
import type { Cell, RunRes } from './sql-run'
import type { Dialect, Kind } from './modelpi/sql-split'
import { parseJdbcUrl } from './modelpi/jdbc-url.ts'

export const ROWQ = /^[\s(]*(SELECT|WITH|VALUES|TABLE)\b/i // 행 질의(cursor 로 가져오기) — SRV 실행(sql-run.ts)과 같은 판정
export const AGT_MIN_VER = '1.4.0' // SQL 지시서를 아는 첫 에이전트 버전
export const AGT_SEEN_MS = 60_000 // 최종 확인이 이보다 오래면 꺼진 것으로(에이전트 폴링 주기보다 넉넉히)
export const AGT_BUSY_MAX = 3 // 접속당 동시 대기·실행 상한
export const RSLT_MAX = 4_000_000 // 결과 업로드 상한(바이트, sql/078 rslt_sz CHECK)
export const LEASE_MS = 120_000 // 에이전트 실행 점유
export const SAFE_MS = 3_000 // 에이전트 예산 여유(업로드·수거 시간)
export const POLL_MS = 1_000 // 서버 수거 간격(BUILD_DEFECTS 2.7 R-P4 예외)
export const RUN_WAIT = { waitMs: 45_000, capMs: 48_000 } // 실행 : 등록 후 45초, 요청 도착 후 48초 중 이른 쪽(라우트 maxDuration 60)
export const META_WAIT = { waitMs: 25_000, capMs: 25_000 } // 메타 : 라우트 maxDuration 30

export type SqlAgtCode = 'SQL_AGT_OFFLINE' | 'SQL_AGT_OUTDATED' | 'SQL_AGT_BUSY' | 'SQL_AGT_NO_PICKUP' | 'SQL_AGT_TIMEOUT' | 'SQL_AGT_RSLT_SIZE'
export const AGT_STATUS: Record<SqlAgtCode, number> = { SQL_AGT_OFFLINE: 409, SQL_AGT_OUTDATED: 426, SQL_AGT_BUSY: 429, SQL_AGT_NO_PICKUP: 504, SQL_AGT_TIMEOUT: 504, SQL_AGT_RSLT_SIZE: 413 }
export const RSLT_SIZE_ERR = 'RSLT_SIZE' // 업로드 크기 초과로 FAIL 처리한 요청의 err_cd

// 끝난 요청 중 화면에 결과 대신 오류 코드로 답할 것 — 크기 초과 FAIL = 413 SQL_AGT_RSLT_SIZE(실행은 됐으나 결과를 못 받음), 그 밖 = null(결과 재결합)
export const doneCode = (sts: string, errCd: string | null): 'SQL_AGT_RSLT_SIZE' | null => (sts === 'FAIL' && errCd === RSLT_SIZE_ERR ? 'SQL_AGT_RSLT_SIZE' : null)

export type AgtStmt = { seq: number; txt: string; kind: Kind; rowq: boolean }
export type RunVal = { v: 1; tp: 'RUN'; mode: 'READ' | 'AUTO' | 'TX' | 'TRY'; limit: number; schema: string | null; stmts: AgtStmt[]; prefix: string[]; stmt_timeout_ms: number; lock_timeout_ms: number; cell_max: number; max_bytes: number }
export type MetaVal = { v: 1; tp: 'META'; node: string; sql: string; binds: (string | null)[]; max_rows: number; stmt_timeout_ms: number }
export type ReqVal = RunVal | MetaVal

// 방언 — 0014 PostgreSQL / 0001 Oracle / 0013 Tibero(Oracle 문법으로 분리·판정), 그 밖 = 미지원
export const agtDialect = (dbms: string): Dialect | null => (dbms === '0014' ? 'PG' : dbms === '0001' || dbms === '0013' ? 'ORA' : null)

// 실행 지시서 — 서버 판정 결과물만(클라이언트 원문 아님), 문장 순번은 1부터
export function runVal(o: { mode: RunVal['mode']; limit: number; schema: string | null; stmts: { txt: string; mask: string }[]; kinds: Kind[]; prefix: string[]; stmt_timeout_ms: number; lock_timeout_ms: number; cell_max: number; max_bytes: number }): RunVal {
  return { v: 1, tp: 'RUN', mode: o.mode, limit: o.limit, schema: o.schema, stmts: o.stmts.map((s, i) => ({ seq: i + 1, txt: s.txt, kind: o.kinds[i], rowq: ROWQ.test(s.mask) })), prefix: o.prefix, stmt_timeout_ms: o.stmt_timeout_ms, lock_timeout_ms: o.lock_timeout_ms, cell_max: o.cell_max, max_bytes: o.max_bytes }
}

// 버전 'x.y.z' → 비교용 숫자(형식이 다르면 null)
export function verNum(v: string | null | undefined): number | null {
  const m = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/.exec(v ?? '')
  return m ? Number(m[1]) * 1e8 + Number(m[2]) * 1e4 + Number(m[3]) : null
}
// User-Agent 의 schemapi-agent/x.y.z → 'x.y.z'(없으면 null)
export const uaVer = (ua: string | null | undefined) => /schemapi-agent\/(\d{1,4}\.\d{1,4}\.\d{1,4})\b/.exec(ua ?? '')?.[1] ?? null
export const verOk = (v: string | null | undefined) => (verNum(v) ?? -1) >= verNum(AGT_MIN_VER)!

// 버전 칼럼(sql/079) 미적용 오류 — PostgREST 스키마 캐시에 없음(PGRST204) / PostgreSQL 칼럼 없음(42703)
export const missingCol = (e: { code?: string } | null | undefined) => e?.code === 'PGRST204' || e?.code === '42703'

// 큐 등록 게이트 — 꺼짐(폐기·만료 포함) → 오래된 버전 → 접속 혼잡 순서, 통과 = null
// ver : undefined = 버전 칼럼 없음(079 미적용, 알 수 없음) → 여기서 막지 않고 claim 의 UA 게이트에 맡김(구버전이면 큐를 안 가져가 45초 뒤 NO_PICKUP) / null·1.4.0 미만 = 즉시 OUTDATED
export function agtGateCode(a: { seen: string | null; ver: string | null | undefined } | null, busy: number, now: number): SqlAgtCode | null {
  if (!a || !a.seen || now - new Date(a.seen).getTime() > AGT_SEEN_MS) return 'SQL_AGT_OFFLINE'
  if (a.ver !== undefined && !verOk(a.ver)) return 'SQL_AGT_OUTDATED'
  return busy >= AGT_BUSY_MAX ? 'SQL_AGT_BUSY' : null
}

export const expAt = (enq: number, startedAt: number, w: { waitMs: number; capMs: number }) => Math.min(enq + w.waitMs, startedAt + w.capMs)
export const budgetMs = (exp: number, now: number) => Math.max(0, exp - now - SAFE_MS) // 서버 계산(에이전트 시계 불신)

// 대기 포기 판정 — 취소 1건 = 실행 안 됨, 0건이면 다시 읽은 상태로 : 끝남 = 결과 사용 / 기한 초과·취소 = 실행 안 됨 / 그 밖(RUN) = 반영 여부 미확인
// 두 코드를 합치지 않는다 — NO_PICKUP 은 다시 실행해도 안전, TIMEOUT 은 쓰기가 반영됐을 수 있어 실행 이력 확인이 먼저
export function giveUpOutcome(cnclN: number, sts: string | null): 'DONE' | 'SQL_AGT_NO_PICKUP' | 'SQL_AGT_TIMEOUT' {
  if (cnclN > 0) return 'SQL_AGT_NO_PICKUP'
  if (sts === 'DONE' || sts === 'FAIL') return 'DONE'
  return sts === 'EXP' || sts === 'CNCL' || sts === 'WAIT' ? 'SQL_AGT_NO_PICKUP' : 'SQL_AGT_TIMEOUT'
}

// 오류 메시지 가림 — 접속 주소·계정·비밀번호를 *** 로, 공백 정리, 200자(SRV·AGT 공용, 원래 db-exec.ts)
export function maskErr(msg: unknown, hide: (string | null | undefined)[]): string {
  let s = String(msg ?? '').replace(/\s+/g, ' ')
  for (const h of hide) if (h && h.length >= 2) s = s.split(h).join('***')
  return s.slice(0, 200)
}

// 에이전트 접속 가림 목록 — 저장된 JDBC URL(호스트:포트·호스트·DB·URL 안 사용자·비밀번호, 쿼리 user·password 류)·계정명·JNDI 이름. 긴 것부터(부분 문자열이 먼저 바뀌어 긴 값이 남지 않게)
// AGT 접속은 서버에 비밀번호를 저장하지 않음(model-ddl-req saveConn : AGT = pwd_enc_txt null) — 비밀번호는 에이전트 PC 환경변수
export function agtHide(c: { conn_url_txt: string | null; usr_nm: string | null; jndi_nm: string | null }): string[] {
  const u = c.conn_url_txt ?? ''
  const p = u ? parseJdbcUrl(u) : null
  const q = [...u.matchAll(/[?&;:](?:user|username|password|pwd|passwd)=([^&;]+)/gi)].map((m) => { try { return decodeURIComponent(m[1]) } catch { return m[1] } })
  const all = [u, p?.port ? `${p.host}:${p.port}` : null, p?.host, p?.db, p?.usr, p?.pwd, ...q, c.usr_nm, c.jndi_nm]
  return [...new Set(all.filter((x): x is string => !!x && x.length >= 2))].sort((a, b) => b.length - a.length)
}
// 에이전트가 올린 오류 메시지(문장별·요청 단위) 전부 가림 — 에이전트 쪽 마스킹을 믿지 않음(구버전·변조 에이전트, 심층 방어)
export function maskAgtErr<T extends { err_msg?: string | null }>(results: T[], err: { err_cd: string | null; err_msg: string | null }, hide: string[]) {
  return { results: results.map((r) => (r.err_msg ? { ...r, err_msg: maskErr(r.err_msg, hide) } : r)), err: { ...err, err_msg: err.err_msg ? maskErr(err.err_msg, hide) : err.err_msg } }
}

// 결과 업로드 본문 — txt·kind 는 받지 않음(서버가 지시서에서 seq 로 재결합)
const cellZ = z.union([z.string(), z.number(), z.boolean(), z.null()])
export const rsltItem = z.object({
  seq: z.number().int().min(1),
  rslt: z.enum(['OK', 'ERR', 'SKIP', 'RBK']),
  columns: z.array(z.object({ name: z.string().max(256), type: z.string().max(256) })).max(5000).nullish(),
  rows: z.array(z.array(cellZ)).nullish(),
  affected: z.number().int().nullish(),
  truncated: z.boolean().nullish(),
  cut: z.enum(['ROWS', 'BYTES', 'TIME']).nullish(),
  ms: z.number().int().min(0).nullish(),
  fetch_ms: z.number().int().min(0).nullish(),
  err_cd: z.string().max(100).nullish(),
  err_msg: z.string().max(2000).nullish(),
})
export type RsltItem = z.infer<typeof rsltItem>
export const rsltBody = z.object({
  run_nonce: z.string().regex(/^[0-9a-f]{32}$/),
  final: z.enum(['DONE', 'FAIL']),
  err_cd: z.string().max(100).nullish(),
  err_msg: z.string().max(2000).nullish(),
  results: z.array(rsltItem).max(100),
})
export type RsltBody = z.infer<typeof rsltBody>
// 크기 판정 — Content-Length 머리글(없으면 실제 본문 바이트)이 상한을 넘으면 413
export const tooBig = (len: number | null) => len != null && len > RSLT_MAX

// 지시서 문장 + 에이전트 결과 → SRV 와 같은 RunRes[](없는 순번 = SKIP, 지시서에 없는 순번은 버림)
// 요청 단위 오류(접속 실패 등)인데 문장 오류가 없으면 첫 미실행 문장에 그 오류를 붙임(SRV runPg·runOra catch 와 같은 모양)
export function mergeRunRes(stmts: AgtStmt[], results: RsltItem[], err?: { err_cd?: string | null; err_msg?: string | null } | null): RunRes[] {
  const by = new Map(results.map((r) => [r.seq, r]))
  const out: RunRes[] = stmts.map((s) => {
    const r = by.get(s.seq)
    const base: RunRes = { seq: s.seq, txt: s.txt, kind: s.kind, rslt: r?.rslt ?? 'SKIP' }
    if (!r) return base
    const x: RunRes = { ...base, err_cd: r.err_cd?.slice(0, 20) ?? null, err_msg: r.err_msg ?? null }
    if (r.columns) x.columns = r.columns
    if (r.rows) x.rows = r.rows as Cell[][]
    if (r.affected != null) x.affected = r.affected
    if (r.truncated != null) x.truncated = r.truncated
    if (r.cut) x.cut = r.cut
    if (r.ms != null) x.ms = r.ms
    if (r.fetch_ms != null) x.fetch_ms = r.fetch_ms
    return x
  })
  if (err?.err_cd && !out.some((r) => r.rslt === 'ERR' || r.err_cd)) {
    const i = Math.max(0, out.findIndex((r) => r.rslt === 'SKIP'))
    if (out[i]) out[i] = { ...out[i], rslt: 'ERR', err_cd: err.err_cd.slice(0, 20), err_msg: err.err_msg ?? null }
  }
  return out
}
