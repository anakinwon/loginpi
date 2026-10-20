// 모니터링 서버 로직(2026-10-21, sql/068) — 앱 지표 누적·조회, 에이전트 호스트 지표 기록·조회, PostgreSQL 지표 스냅샷, URL 점검(SSRF 차단)·수집·보관 정리
import 'server-only'
import { lookup } from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import { isIP } from 'node:net'
import { db } from './db'
import { inChunks } from './paging'
import { pgClient, type Target } from './db-exec'
import { ipAllowed } from './modelpi/net-guard'
import { KEEP_DAYS, minuteOf, type AppRow } from './mon'

const since = (min: number) => new Date(Date.now() - min * 60000).toISOString()
const thisMin = () => minuteOf(Date.now())

// 전역 관리자(sys_user.role_cd = ADMIN) — 앱 모니터링은 schema.pi 전체 트래픽이라 분류체계 권한이 아니라 전역 관리자만
export async function isGlobalAdmin(usrId: string) {
  const r = await db().from('sys_user').select('role_cd').eq('usr_id', usrId).eq('del_yn', 'N').maybeSingle()
  if (r.error) throw r.error
  return (r.data as { role_cd: string } | null)?.role_cd === 'ADMIN'
}

// ① 애플리케이션 ----------------------------------------------------------------
export async function addApp(rows: AppRow[]) {
  if (!rows.length) return
  const { error } = await db().rpc('fn_mon_app_add', { p_rows: rows })
  if (error) throw error
}
export async function appView(min: number) {
  // 최신 구간부터 5,000행(상한에 걸리면 오래된 쪽이 빠짐) → 화면용으로 시간 순 정렬
  const r = await db().from('mon_app_hist').select('bkt_dtm, route_txt, req_cnt, err_cnt, slow_cnt, rsp_sum_val, rsp_max_val').gte('bkt_dtm', since(min)).order('bkt_dtm', { ascending: false }).limit(5000)
  if (r.error) throw r.error
  return [...r.data].reverse() as (Omit<AppRow, 'rsp_sum_val'> & { rsp_sum_val: number | string })[]
}

// ② 서버(로컬 에이전트 호스트) ----------------------------------------------------
export interface SrvMetric {
  host: string
  os: string
  cores: number
  cpu: number // 0~100
  mem_tot: number
  mem_used: number
  disk_tot: number
  disk_used: number
}
const num = (v: unknown, max = Number.MAX_SAFE_INTEGER) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null)
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\p{Cc}]/gu, '').slice(0, n) : null)
// 에이전트 폴링 본문 { m: {...} } — 값은 범위만 확인해 저장(1분 1행, 같은 분 재보고는 무시)
export async function recordSrv(g: { agt_id: string; area_id: string }, m: unknown) {
  if (!m || typeof m !== 'object') return
  const x = m as Record<string, unknown>
  const row = {
    agt_id: g.agt_id,
    bkt_dtm: thisMin(),
    area_id: g.area_id,
    host_nm: str(x.host, 200),
    os_nm: str(x.os, 100),
    core_cnt: num(x.cores, 4096),
    cpu_pct: num(x.cpu, 100),
    mem_tot_sz: num(x.mem_tot),
    mem_used_sz: num(x.mem_used),
    disk_tot_sz: num(x.disk_tot),
    disk_used_sz: num(x.disk_used),
  }
  const { error } = await db().from('mon_srv_hist').upsert(row, { onConflict: 'agt_id,bkt_dtm', ignoreDuplicates: true })
  if (error) console.error('[mon] recordSrv', error.code, error.message) // 지표 실패가 작업 가져가기를 막지 않게
}
export async function srvView(areaId: string, min: number) {
  const [a, h] = await Promise.all([
    db().from('mdl_db_agt').select('agt_id, agt_nm, lst_seen_dtm').eq('area_id', areaId).eq('del_yn', 'N'),
    db().from('mon_srv_hist').select('agt_id, bkt_dtm, host_nm, os_nm, core_cnt, cpu_pct, mem_tot_sz, mem_used_sz, disk_tot_sz, disk_used_sz').eq('area_id', areaId).gte('bkt_dtm', since(min)).order('bkt_dtm').limit(5000),
  ])
  if (a.error) throw a.error
  if (h.error) throw h.error
  return { agents: a.data as { agt_id: string; agt_nm: string; lst_seen_dtm: string | null }[], hist: h.data }
}

// ③ 데이터베이스(PostgreSQL, 서버 직접 접속) ----------------------------------------
const PG_STAT = `SELECT
  (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND state = 'active' AND pid <> pg_backend_pid())::int AS sess_cnt,
  (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database())::int AS conn_cnt,
  (SELECT count(*) FROM pg_locks WHERE NOT granted)::int AS lock_wait_cnt,
  (d.xact_commit + d.xact_rollback)::bigint AS xact_cnt, d.blks_hit::bigint AS blks_hit_cnt, d.blks_read::bigint AS blks_read_cnt,
  (d.tup_inserted + d.tup_updated + d.tup_deleted)::bigint AS tup_cnt, d.deadlocks::bigint AS dlck_cnt, d.temp_bytes::bigint AS tmp_sz,
  pg_database_size(current_database())::bigint AS db_sz
FROM pg_stat_database d WHERE d.datname = current_database()`
// 활성 세션 상위 — 질의 문자열은 200자, 실행 시간 긴 순
const PG_SESS = `SELECT pid, usename AS usr_nm, client_addr::text AS client_addr, state, wait_event_type || ':' || wait_event AS wait_event,
  round(extract(epoch FROM now() - query_start) * 1000)::bigint AS run_ms, left(regexp_replace(query, '\\s+', ' ', 'g'), 200) AS query
FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND state <> 'idle'
ORDER BY query_start NULLS LAST LIMIT 20`
type Big = string | number | null
export type DbStat = { sess_cnt: number; conn_cnt: number; lock_wait_cnt: number; xact_cnt: Big; blks_hit_cnt: Big; blks_read_cnt: Big; tup_cnt: Big; dlck_cnt: Big; tmp_sz: Big; db_sz: Big }
export async function dbSnapshot(areaId: string, connId: string, t: Target, pwd: string) {
  const sql = pgClient(t, pwd)
  try {
    // 읽기 전용 + 짧은 제한(감시 질의가 대상 DB 에 부담·잠금을 주지 않게)
    const [stat, sess] = await sql.begin('READ ONLY', async (tx) => {
      await tx.unsafe("SET LOCAL statement_timeout = '5s'")
      await tx.unsafe("SET LOCAL lock_timeout = '1s'")
      return [await tx.unsafe(PG_STAT), await tx.unsafe(PG_SESS)] as const
    })
    const s = stat[0] as unknown as DbStat
    const { error } = await db()
      .from('mon_db_hist')
      .upsert({ conn_id: connId, bkt_dtm: thisMin(), area_id: areaId, ...s }, { onConflict: 'conn_id,bkt_dtm', ignoreDuplicates: true })
    if (error) console.error('[mon] dbSnapshot hist', error.code, error.message)
    return { stat: s, sess: sess as unknown as Record<string, unknown>[] }
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {})
  }
}
export async function dbHist(areaId: string, connId: string, min: number) {
  const r = await db().from('mon_db_hist').select('bkt_dtm, sess_cnt, conn_cnt, lock_wait_cnt, xact_cnt, blks_hit_cnt, blks_read_cnt, tup_cnt, dlck_cnt, tmp_sz, db_sz').eq('area_id', areaId).eq('conn_id', connId).gte('bkt_dtm', since(min)).order('bkt_dtm').limit(2000)
  if (r.error) throw r.error
  return r.data
}

// ④ URL ---------------------------------------------------------------------------
const TIMEOUT_MS = 10_000
const MAX_BODY = 1_000_000
// 점검 1회 — DNS 결과를 net-guard 로 검사한 주소로만 연결(사설·메타데이터 차단, 재바인딩 차단 = 연결 때 다시 검사), 리다이렉트는 따라가지 않고 상태 그대로
export function checkUrl(url: string): Promise<{ sts: number; ms: number; err: string | null }> {
  const t0 = Date.now()
  return new Promise((done) => {
    let u: URL
    try {
      u = new URL(url)
    } catch {
      return done({ sts: 0, ms: 0, err: '주소 형식 오류' })
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return done({ sts: 0, ms: 0, err: 'http·https 만' })
    if (u.username || u.password) return done({ sts: 0, ms: 0, err: '주소에 계정 정보 금지' })
    // 호스트가 IP 숫자면 Node 가 lookup 을 건너뛰므로 여기서 직접 검사(127.0.0.1·[::1]·169.254.169.254 등 — 2026-10-21 시험에서 우회 확인 후 추가)
    const ipHost = u.hostname.replace(/^\[|\]$/g, '')
    if (isIP(ipHost) && !ipAllowed(ipHost)) return done({ sts: 0, ms: 0, err: '내부망 주소 차단' })
    const end = (sts: number, err: string | null) => done({ sts, ms: Date.now() - t0, err })
    const guardLookup = (host: string, opts: object, cb: (e: Error | null, addr: string | { address: string; family: number }[], fam?: number) => void) => {
      lookup(host, { all: true })
        .then((as) => {
          if (!as.length) return cb(new Error('DNS'), '', 0)
          if (as.some((a) => !ipAllowed(a.address))) return cb(new Error('BLOCKED'), '', 0)
          if ((opts as { all?: boolean }).all) return cb(null, as)
          cb(null, as[0].address, as[0].family)
        })
        .catch(() => cb(new Error('DNS'), '', 0))
    }
    const req = (u.protocol === 'https:' ? https : http).request(u, { method: 'GET', lookup: guardLookup as never, timeout: TIMEOUT_MS, headers: { 'User-Agent': 'schemapi-monitor/1.0', Accept: '*/*' } }, (res) => {
      let n = 0
      res.on('data', (c: Buffer) => {
        n += c.length
        if (n > MAX_BODY) res.destroy() // 큰 본문은 앞부분만(응답 시간은 첫 1MB 까지)
      })
      res.on('end', () => end(res.statusCode ?? 0, null))
      res.on('close', () => end(res.statusCode ?? 0, null))
      res.on('error', () => end(res.statusCode ?? 0, null))
    })
    req.on('timeout', () => req.destroy(new Error('TIMEOUT')))
    // timeout 은 유휴 시간만 재므로 전체 상한도(조금씩 보내는 느린 응답이 점검을 붙잡지 않게)
    const hard = setTimeout(() => req.destroy(new Error('TIMEOUT')), TIMEOUT_MS)
    req.on('close', () => clearTimeout(hard))
    req.on('error', (e) => end(0, e.message === 'BLOCKED' ? '내부망 주소 차단' : e.message === 'DNS' ? '호스트를 찾을 수 없음' : e.message === 'TIMEOUT' ? '시간 초과(10초)' : '접속 실패'))
    req.end()
  })
}

type UrlRow = { url_id: string; area_id: string; chk_url: string }
// 이번 분에 아직 점검하지 않은 URL 만 점검해 기록(화면 여러 개·주기 수집이 겹쳐도 1분 1행), 동시 5개
async function checkRows(rows: UrlRow[], deadline = Date.now() + 40_000) {
  if (!rows.length) return 0
  const bkt = thisMin()
  const done = await inChunks(rows.map((r) => r.url_id), (p) => db().from('mon_url_hist').select('url_id').eq('bkt_dtm', bkt).in('url_id', p)) // 150개씩(GET 주소 길이 한도)
  if (done.error) throw done.error
  const skip = new Set((done.data as { url_id: string }[]).map((x) => x.url_id))
  const todo = rows.filter((r) => !skip.has(r.url_id))
  // 시간 예산(기본 40초) 안에서만 — 남은 URL 은 다음 분·다음 주기에(함수 시간 초과로 기록 전체를 잃지 않게)
  let n = 0
  for (let i = 0; i < todo.length && Date.now() + TIMEOUT_MS < deadline; i += 10) {
    const part = todo.slice(i, i + 10)
    const rs = await Promise.all(part.map((r) => checkUrl(r.chk_url)))
    const { error } = await db()
      .from('mon_url_hist')
      .upsert(part.map((r, k) => ({ url_id: r.url_id, bkt_dtm: bkt, area_id: r.area_id, sts_no: rs[k].sts, rsp_val: rs[k].ms, err_txt: rs[k].err })), { onConflict: 'url_id,bkt_dtm', ignoreDuplicates: true })
    if (error) throw error
    n += part.length
  }
  return n
}
export async function checkArea(areaId: string) {
  const r = await db().from('mon_url').select('url_id, area_id, chk_url').eq('area_id', areaId).eq('use_yn', 'Y').eq('del_yn', 'N').limit(100)
  if (r.error) throw r.error
  return checkRows(r.data as UrlRow[])
}
export async function urlView(areaId: string, min: number) {
  const [u, h] = await Promise.all([
    db().from('mon_url').select('url_id, url_nm, chk_url, use_yn, ver_no').eq('area_id', areaId).eq('del_yn', 'N').order('url_nm').limit(100),
    db().from('mon_url_hist').select('url_id, bkt_dtm, sts_no, rsp_val, err_txt').eq('area_id', areaId).gte('bkt_dtm', since(min)).order('bkt_dtm').limit(10000),
  ])
  if (u.error) throw u.error
  if (h.error) throw h.error
  return { urls: u.data, hist: h.data }
}

// 주기 수집(Vercel Cron, CRON_SECRET) — 전체 사용 URL 점검 + 보관 기간 지난 이력 정리(이력 = 추가 전용 로그라 물리 삭제 허용, sql/068)
export async function collectAll() {
  // 보관 정리를 먼저(점검이 시간 예산에 걸려도 정리는 매번 실행)
  const old = since(KEEP_DAYS * 1440)
  for (const t of ['mon_app_hist', 'mon_srv_hist', 'mon_db_hist', 'mon_url_hist']) {
    const d = await db().from(t).delete().lt('bkt_dtm', old)
    if (d.error) throw d.error
  }
  const r = await db().from('mon_url').select('url_id, area_id, chk_url').eq('use_yn', 'Y').eq('del_yn', 'N').order('mod_dtm').limit(1000)
  if (r.error) throw r.error
  return { checked: await checkRows(r.data as UrlRow[], Date.now() + 45_000), total: r.data.length }
}
