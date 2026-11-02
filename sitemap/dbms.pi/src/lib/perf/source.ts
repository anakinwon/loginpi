// 느린 쿼리 출처 판정 순수 함수 — 표본(pg_stat_activity 계정·앱·백엔드유형) 규칙 9종 분류 + 쿼리문 지문(모니터링 수집 = 통계·카탈로그만 읽는 문장)·확신도·접속주소 마스킹·query_id 미수집 원인. 의존성 없음
//  계정(pg_stat_statements userid)은 확정, 앱 분류는 표본 기반 추정(application_name 은 클라이언트 자기 신고값). 시험 : node --test src/lib/perf/source.test.mjs

export type SrcCd =
  | 'PROGRAM'
  | 'BATCH'
  | 'TOOL'
  | 'PLATFORM'
  | 'MONITOR'
  | 'UNKNOWN'
export type SrcConf = 'high' | 'mid' | 'low' | 'acct' | 'ver'
// query_id 가 전부 비었을 때 원인 — ok(수집됨)·ver(PG14 미만)·priv(pg_read_all_stats 권한 부족)·off(compute_query_id 꺼짐)
export type QidCause = 'ok' | 'ver' | 'priv' | 'off'

// 규칙 기본 확신(높음 1 / 보통 0.7 / 낮음 0.4) · 판정 문턱 — 바꾸면 화면 문구(perf.src.conf.*)도 함께 확인
const W = { high: 1, mid: 0.7, low: 0.4 } as const
export const CONF = { high: 0.8, mid: 0.5, minSmp: 3 }
export const QID_MIN_VER = 140000 // pg_stat_activity.query_id 는 PG14+
export const MONITOR_APPS: Record<string, number> = {
  'dbms.pi-link': W.high, // schema.pi 연결 API 가 대상 DB 에 붙일 때 이름(schema.pi src/lib/link/queries.ts LINK_APP)
  'schema.pi': W.high,
  'postgres.js': W.low,
} // postgres.js 기본 이름 = 우리일 수도(schema.pi SQL 편집기 등), 고객 노드 앱일 수도
const NO_PRIV = '<insufficient privilege>'

// 판정 순서대로(첫 일치가 결과)
const RE = {
  batchApp:
    /pg_cron|cron|batch|job|sched|airflow|dbt|etl|spark|worker|celery|sidekiq/i,
  batchUsr: /batch|cron|etl|job/i,
  tool: /DBeaver|pgAdmin|DataGrip|psql|TablePlus|Navicat|DbVisualizer|HeidiSQL|SQL Workbench|Postico|Beekeeper|Azure Data Studio|supabase\/dashboard/i,
  postgrest: /^postgrest/i, // 앱 API 경로 = 프로그램
  platformApp: /^(realtime|storage-api|gotrue|supavisor|pgbouncer|pg_net)/i,
  progUsr: /app|svc|api|service|web/i,
  toolUsr: /admin|dba|dev|readonly|^[a-z]+[._][a-z]+$/i, // 사람 이름꼴(hong.gildong)
}
const PLATFORM_USRS = new Set([
  'supabase_admin',
  'supabase_auth_admin',
  'supabase_storage_admin',
])

export type SrcIn = {
  usrNm: string | null
  appNm: string | null
  bkndTp: string | null
}

export function classifySrc(f: SrcIn): { cd: SrcCd; w: number } {
  const app = (f.appNm ?? '').trim()
  const usr = f.usrNm ?? ''
  if (f.bkndTp && f.bkndTp !== 'client backend')
    return { cd: 'PLATFORM', w: W.high } // 1 autovacuum·walsender·background worker
  if (MONITOR_APPS[app]) return { cd: 'MONITOR', w: MONITOR_APPS[app] } // 2 우리 자신
  // 도구 먼저 — DBeaver·pgAdmin 은 앱명에 연결·DB 이름(<batch_prod>·DB:worker_db)을 붙이므로 배치어 오판 방지
  if (RE.tool.test(app)) return { cd: 'TOOL', w: W.high } // 4
  if (RE.batchApp.test(app)) return { cd: 'BATCH', w: W.high } // 3
  if (RE.postgrest.test(app)) return { cd: 'PROGRAM', w: W.high } // 5 PostgREST = 앱 API
  if (RE.platformApp.test(app) || PLATFORM_USRS.has(usr))
    return { cd: 'PLATFORM', w: W.high } // 5 관리형 내부
  if (app) return { cd: 'PROGRAM', w: W.mid } // 6 JDBC·prisma·psycopg·서비스명 등
  // 앱 이름 빈 값 — 계정명만 단서(낮음). 계정 배치 규칙은 앱이 비었을 때만(배치 계정으로 DBeaver 를 쓴 경우 오분류 방지)
  if (RE.batchUsr.test(usr)) return { cd: 'BATCH', w: W.low } // 3(계정만)
  if (RE.progUsr.test(usr)) return { cd: 'PROGRAM', w: W.low } // 7
  if (RE.toolUsr.test(usr)) return { cd: 'TOOL', w: W.low } // 8
  return { cd: 'UNKNOWN', w: 0 } // 9
}

export type SrcSample = SrcIn & {
  addr: string
  smpCnt: number
  actvCnt?: number // 활성 표본수(state=active) — idle 세션도 마지막 query_id 를 유지하므로 판정은 이 값 우선
  fstDtm?: string | null
  lstDtm?: string | null
}
export type SrcJudge = {
  cd: SrcCd
  conf: SrcConf
  smpCnt: number
  actvCnt: number
  top: SrcSample[]
}

// 쿼리문 지문 — 통계 뷰·카탈로그(pg_* · pg_catalog · information_schema)만 읽는 SELECT/WITH = 모니터링 수집 문장
//  (dbms.pi 가 schema.pi 연결 API 로 돌리는 이름 붙인 조회 top_sql·activity·sizes 등 — 문장이 고정이라 표본 없이도 확정). 사용자 테이블·함수를 하나라도 읽으면 아님
//  ponytail: 토큰 수준 FROM/JOIN 해석(완전한 SQL 파서 아님) — 애매하면 '아님'(고객 쿼리를 숨기지 않는 쪽). now()·unnest() 같은 내장 함수도 FROM 뒤면 아님
//  ponytail: FROM/JOIN 자리만 본다 — SELECT 목록·WHERE 안의 사용자 함수(SELECT my_fn() FROM pg_class)는 못 봐 '자체'로 오판할 수 있음. 오판이 보이면 함수 호출 토큰(이름 + '(')을 내장 목록과 대조하는 단계 추가
const SELF_MAX_LEN = 1000 // top_sql 이 쿼리문을 1000자로 자름 — 이 길이면 뒤(사용자 테이블)가 잘렸을 수 있어 판정 안 함
const SYS_REL =
  /^(?:(?:pg_catalog|information_schema)\.[\w$]+|(?:pg_catalog\.)?pg_[\w$]+)$/
const FROM_END = new Set(
  'where group having order limit offset fetch window union intersect except for returning'.split(
    ' ',
  ),
)
export function isSelfQry(sql: string | null | undefined): boolean {
  if (!sql || sql.length >= SELF_MAX_LEN) return false
  const s = sql
    .replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/\b(extract\s*\(\s*\w+|distinct)\s+from\b/gi, '$1 ') // 관계가 아닌 FROM(extract·IS DISTINCT FROM)
    .toLowerCase()
  if (!/^\s*(select|with)\b/.test(s)) return false
  const cte = new Set(
    [
      ...s.matchAll(
        /\b([a-z_][\w$]*)\s+as\s+(?:not\s+)?(?:materialized\s+)?\(/g,
      ),
    ].map((m) => m[1]),
  )
  const tok =
    s.match(/"[^"]*"(?:\."[^"]*")?|[a-z_][\w$]*(?:\.[a-z_][\w$]*)?|[(),]/g) ??
    []
  const fromAt: boolean[] = [false] // 괄호 깊이별 'FROM 목록 안'(쉼표 = 다음 관계)
  let d = 0
  let want = false // 다음 토큰 = 관계(FROM·JOIN·FROM 목록 쉼표 뒤)
  let sys = 0
  let lastSys = '' // 바로 앞 토큰이 받아들인 시스템 관계 이름 — 다음이 '(' 면 함수 호출
  for (const t of tok) {
    const prevSys = lastSys
    lastSys = ''
    if (t === '(') {
      // 시스템 이름 + '(' = 함수 호출(pg_sleep($1) 등) — 통계 함수 pg_stat_statements(…)만 수집 문장
      if (
        prevSys &&
        prevSys.replace(/^pg_catalog\./, '') !== 'pg_stat_statements'
      )
        return false
      // 관계 대기 중 '(' = 서브쿼리(select·values·with) 또는 괄호 조인 — want 유지, 서브쿼리면 다음 토큰에서 해제
      fromAt[++d] = false
    } else if (t === ')') {
      fromAt[d] = false
      d = Math.max(0, d - 1)
    } else if (t === ',') {
      if (fromAt[d]) want = true
    } else if (t === 'from') {
      fromAt[d] = true
      want = true
    } else if (t === 'join') want = true
    else if (want) {
      if (t === 'lateral' || t === 'only') continue
      want = false
      if (t === 'select' || t === 'values' || t === 'with') continue // 서브쿼리 — 안쪽 FROM 은 이어서 검사
      const nm = t.replace(/"/g, '')
      if (cte.has(nm)) continue
      if (!SYS_REL.test(nm)) return false
      sys++
      lastSys = nm
    } else if (FROM_END.has(t)) fromAt[d] = false
  }
  return sys > 0
}

// 쿼리 1건 판정 : 쿼리문이 모니터링 수집 지문(isSelfQry)이면 표본과 무관하게 MONITOR·확신 높음(표본은 상세 표시용으로 그대로)
export function judgeSrc(
  samples: SrcSample[],
  acct?: string | null,
  verNum?: number | null,
  qryTxt?: string | null,
): SrcJudge {
  const j = judgeSmp(samples, acct, verNum)
  return isSelfQry(qryTxt) ? { ...j, cd: 'MONITOR', conf: 'high' } : j
}

// 표본 판정 : acct(top_sql 계정 — 확정)가 있으면 그 계정 표본만, 표본을 분류별 합산 → 최다 분류, 확신 = 최다 비율 × 규칙 기본 확신(표본 가중 평균)
//  가중 = 활성 표본 하나라도 있으면 활성 표본수만(쉬는 도구 세션이 폴링마다 쌓이는 편향 제거), 전부 idle 이면 전체 표본수 + 확신 상한 '보통'
function judgeSmp(
  samples: SrcSample[],
  acct?: string | null,
  verNum?: number | null,
): SrcJudge {
  const own = acct ? samples.filter((s) => s.usrNm === acct) : samples
  if (!own.length) {
    // 표본 없음 — 계정명 규칙만(분류는 참고, 확신 = 계정만 / PG14 미만이면 버전 한계)
    const cd = acct
      ? classifySrc({ usrNm: acct, appNm: null, bkndTp: null }).cd
      : 'UNKNOWN'
    return {
      cd,
      conf: verNum != null && verNum < QID_MIN_VER ? 'ver' : 'acct',
      smpCnt: 0,
      actvCnt: 0,
      top: [],
    }
  }
  const actvCnt = own.reduce((a, s) => a + Math.max(0, s.actvCnt ?? 0), 0)
  const nOf = (s: SrcSample) =>
    Math.max(0, actvCnt ? (s.actvCnt ?? 0) : s.smpCnt)
  const by = new Map<SrcCd, { n: number; wn: number }>()
  let total = 0
  for (const s of own) {
    const n = nOf(s)
    const c = classifySrc(s)
    const e = by.get(c.cd) ?? { n: 0, wn: 0 }
    e.n += n
    e.wn += n * c.w
    by.set(c.cd, e)
    total += n
  }
  const [cd, e] = [...by].sort((a, b) => b[1].n - a[1].n)[0]
  const score = total && e.n ? (e.n / total) * (e.wn / e.n) : 0
  const conf: SrcConf =
    cd === 'UNKNOWN'
      ? 'low'
      : score >= CONF.high && total >= CONF.minSmp && actvCnt
        ? 'high'
        : score >= CONF.mid
          ? 'mid'
          : 'low'
  const top = [...own].sort((a, b) => nOf(b) - nOf(a)).slice(0, 3)
  const smpCnt = own.reduce((a, s) => a + Math.max(0, s.smpCnt), 0)
  return { cd, conf, smpCnt, actvCnt, top }
}

// 접속주소 마스킹 — IPv4 /24 · IPv6 /48 · 없음(유닉스 소켓) 'local'. 원주소는 저장·응답하지 않는다(계약 A3). inet::text 의 '/32' 꼬리 허용
export function maskAddr(ip: string | null | undefined): string {
  const v = (ip ?? '').trim().replace(/\/\d+$/, '')
  if (!v) return 'local'
  const v4 = v.replace(/^::ffff:/i, '')
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v4)
  if (m)
    return m.slice(1).every((x) => Number(x) <= 255)
      ? `${m[1]}.${m[2]}.${m[3]}.0/24`
      : ''
  if (!/^[0-9a-f:]+$/i.test(v) || !v.includes(':')) return ''
  const [head, tail] = v.split('::')
  if (v.split('::').length > 2) return ''
  const h = head ? head.split(':') : []
  const t = tail !== undefined ? (tail ? tail.split(':') : []) : []
  const full =
    tail !== undefined
      ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t]
      : h
  if (full.length !== 8) return ''
  return `${full
    .slice(0, 3)
    .map((x) => x.toLowerCase().replace(/^0+(?=.)/, ''))
    .join(':')}::/48`
}

export type QidRow = {
  backendType: string | null
  queryId: string | null
  query: string | null
}

// activity 표본에서 query_id 미수집 원인 — 일반 세션이 하나도 없으면 판단 불가(null)
export function qidCause(
  rows: QidRow[],
  verNum: number | null,
): QidCause | null {
  const cl = rows.filter((r) => r.backendType === 'client backend')
  if (cl.some((r) => r.queryId)) return 'ok'
  if (verNum != null && verNum < QID_MIN_VER) return 'ver'
  if (cl.some((r) => r.query === NO_PRIV)) return 'priv' // 다른 계정 세션의 query·query_id 를 못 봄
  if (cl.some((r) => r.query)) return 'off' // 쿼리문은 보이는데 ID 만 비었음 = compute_query_id=off
  return null
}
