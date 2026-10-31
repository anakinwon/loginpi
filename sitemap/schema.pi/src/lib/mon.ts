// 모니터링 공용 순수 로직(2026-10-21, sql/068) — 브라우저·서버 공용(서버 전용 기능 없음)
// 경로 정규화(UUID·숫자 → :id), 응답 표본 → 분 × 경로 묶음, 누적 카운터 → 구간 초당 값, HTTP 상태 분류
import { normPage, normRoute, type RawSample } from '@pi/mon'
export const SLOW_MS = 1000 // 느림 기준(1초)
export const KEEP_DAYS = 7 // 이력 보관

// 경로·화면 정규화와 시스템코드는 공용 패키지 단일 소스(2026-10-24 cafe.pi·sitemap.pi 모니터링 — 모든 시스템이 같은 기준)
export { normPage, normRoute, SYSTEMS, isSys, type SysCd } from '@pi/mon'

// 브라우저 표본 → 서버 표본(서버가 다시 정규화, 끝난 시각은 지금 ±10분만, 클라이언트 값 신뢰 안 함) — /api/mon/app·/api/mon/ingest 공용
export function toSamples(raw: RawSample[], now = Date.now()): Sample[] {
  const ss: Sample[] = []
  for (const x of raw) {
    const route = normRoute(x.r)
    if (route && Math.abs(x.t - now) < 600_000 && x.ms >= 0) ss.push({ route, t: x.t, ms: x.ms, status: x.st, page: x.p ? normPage(x.p) : null })
  }
  return ss
}

// AI 원인 분석 주원인 = 1순위 원인 제목 앞 200자(sql/073 main_caus_txt 길이) — 서버 저장·화면 비교가 같은 기준
export const mainOf = (r: { causes: { title: string }[] }) => r.causes[0]?.title.slice(0, 200) ?? null

export const minuteOf = (t: number) => new Date(Math.floor(t / 60000) * 60000).toISOString()

export interface Sample {
  route: string
  t: number // 끝난 시각(epoch ms)
  ms: number
  status: number // 0 = 네트워크 실패·알 수 없음
  page?: string | null // 요청이 나온 화면(normPage)
}
export interface AppRow {
  bkt_dtm: string
  route_txt: string
  req_cnt: number
  err_cnt: number
  slow_cnt: number
  rsp_sum_val: number
  rsp_max_val: number
}
// 응답 상태 0 은 브라우저가 상태를 주지 않은 경우(교차 출처·구형) — 같은 출처 fetch 는 실제 상태가 오므로 0 = 실패로 셈
export function bucketize(ss: Sample[]): AppRow[] {
  const m = new Map<string, AppRow>()
  for (const s of ss) {
    const ms = Math.max(0, Math.min(Math.round(s.ms), 600_000))
    const k = `${minuteOf(s.t)}|${s.route}`
    const r = m.get(k) ?? { bkt_dtm: minuteOf(s.t), route_txt: s.route, req_cnt: 0, err_cnt: 0, slow_cnt: 0, rsp_sum_val: 0, rsp_max_val: 0 }
    r.req_cnt++
    if (s.status === 0 || s.status >= 400) r.err_cnt++
    if (ms >= SLOW_MS) r.slow_cnt++
    r.rsp_sum_val += ms
    r.rsp_max_val = Math.max(r.rsp_max_val, ms)
    m.set(k, r)
  }
  return [...m.values()]
}

// 개별 이벤트 판정(sql/069) — 오류(0·4xx·5xx) 우선, 아니면 느림, 둘 다 아니면 저장 안 함
export const evtCd = (ms: number, status: number): 'ERR' | 'SLOW' | null => (status === 0 || status >= 400 ? 'ERR' : ms >= SLOW_MS ? 'SLOW' : null)

// 누적 카운터 시계열 → 구간 초당 값(재시작 등으로 줄면 그 구간은 null)
export function perSec(pts: { t: string; v: number | null }[]): { t: string; v: number | null }[] {
  return pts.slice(1).map((p, i) => {
    const a = pts[i]
    const dt = (new Date(p.t).getTime() - new Date(a.t).getTime()) / 1000
    if (p.v === null || a.v === null || dt <= 0 || p.v < a.v) return { t: p.t, v: null }
    return { t: p.t, v: Math.round(((p.v - a.v) / dt) * 100) / 100 }
  })
}

// 캐시 적중률(%) — 구간 차이 기준(누적 그대로면 오래된 값이 지배)
export function hitPct(hitA: number, readA: number, hitB: number, readB: number): number | null {
  const h = hitB - hitA
  const r = readB - readA
  if (h < 0 || r < 0 || h + r === 0) return null
  return Math.round((h / (h + r)) * 10000) / 100
}

export type StsCls = 'OK' | 'REDIR' | 'CLIENT' | 'SERVER' | 'FAIL'
export const stsCls = (s: number): StsCls => (s === 0 ? 'FAIL' : s >= 500 ? 'SERVER' : s >= 400 ? 'CLIENT' : s >= 300 ? 'REDIR' : 'OK')

// API 경로(normRoute 결과) → 사용자 메뉴명(area-nav.tsx nm 기준) — 긴 접두사 우선, 모르면 '기타'
const A = '/api/areas/:id'
const MENU: [string, string, 'exact'?][] = [
  ['/api/home', '메인 대시보드'],
  ['/api/areas', '분류체계 목록', 'exact'],
  [A, '분류체계 정보(공통)', 'exact'], // 하위 미등록 경로는 '기타'
  ['/api/auth', '로그인·세션'],
  ['/api/dev/user', '개발용 사용자 전환'],
  ['/api/payments', '결제'],
  [`${A}/plan`, '결제'],
  ['/api/types', '데이터 타입(표준도메인·ERD)'],
  ['/api/dbms-profiles', '개념 모델 · 프로젝트(DBMS)'],
  ['/api/industries', '개념 모델 · 프로젝트(업종)'],
  ['/api/agent', '로컬 에이전트'],
  ['/api/mon', '모니터링'],
  [`${A}/mon`, '모니터링'],
  [`${A}/words`, '표준단어'],
  [`${A}/export/words`, '표준단어(내려받기)'],
  [`${A}/domains`, '표준도메인'],
  [`${A}/export/domains`, '표준도메인(내려받기)'],
  [`${A}/key-domains`, '대표도메인'],
  [`${A}/domain-groups`, '도메인그룹'],
  [`${A}/terms`, '표준용어'],
  [`${A}/export/terms`, '표준용어(내려받기)'],
  [`${A}/codes`, '표준코드'],
  [`${A}/bulk`, '일괄등록'],
  [`${A}/projects`, '개념 모델 · 프로젝트'],
  [`${A}/subjects`, '개념 모델 · 주제영역'],
  [`${A}/entities`, '개념 모델 · 핵심엔터티'],
  [`${A}/entities/:id/attributes`, '논리 모델 · 속성'],
  [`${A}/relations`, '논리 모델 · 관계'],
  [`${A}/entity-classes`, '엔터티 분류어'],
  [`${A}/projects/:id/logical`, '논리 모델'],
  [`${A}/projects/:id/docs`, '논리 모델(산출물)'],
  [`${A}/projects/:id/physical`, '물리 모델'],
  [`${A}/projects/:id/stage`, '모델 단계(논리·물리·ERD)'],
  [`${A}/projects/:id/diagram`, 'ERD'],
  [`${A}/projects/:id/versions`, 'ERD(버전)'],
  [`${A}/projects/:id/ddl`, 'DDL 생성'],
  [`${A}/projects/:id/ddl-reqs`, 'DDL 생성(요청)'],
  [`${A}/projects/:id/reverse`, '리버스'],
  [`${A}/db-conns`, 'DB 접속(DDL 생성·SQL 편집기)'],
  [`${A}/db-agts`, 'DDL 생성(에이전트)'],
  [`${A}/sql`, 'SQL 편집기'],
  [`${A}/abbreviations`, '설정(약어)'],
  [`${A}/history`, '이력'],
  [`${A}/forbidden`, '금칙어'],
  [`${A}/check`, '표준 점검'],
  [`${A}/members`, '멤버'],
  [`${A}/approvals`, '승인'],
]
MENU.sort((a, b) => b[0].length - a[0].length)
export const routeMenu = (route: string): string => MENU.find(([p, , ex]) => route === p || (!ex && route.startsWith(`${p}/`)))?.[1] ?? '기타'

// 화면 경로(normPage 결과) → 메뉴명(area-nav.tsx seg → nm, src/app/**/page.tsx 전수 대조) — 모르면 '기타'
const P = '/areas/:id'
const PAGE: [string, string][] = [
  ['/', '메인'],
  ['/link', '계정 연동'],
  [`${P}/words`, '표준단어'],
  [`${P}/domains`, '표준도메인'],
  [`${P}/key-domains`, '대표도메인'],
  [`${P}/domain-groups`, '도메인그룹'],
  [`${P}/terms`, '표준용어'],
  [`${P}/codes`, '표준코드'],
  [`${P}/bulk`, '일괄등록'],
  [`${P}/model`, '개념 모델'],
  [`${P}/entity-classes`, '엔터티 분류어'],
  [`${P}/logical`, '논리 모델'],
  [`${P}/physical`, '물리 모델'],
  [`${P}/erd`, 'ERD'],
  [`${P}/ddl`, 'DDL 생성'],
  [`${P}/monitor`, '모니터링'],
  [`${P}/sql`, 'SQL 편집기'],
  [`${P}/settings`, '설정'],
  [`${P}/history`, '이력'],
  [`${P}/forbidden`, '금칙어'],
  [`${P}/check`, '표준 점검'],
  [`${P}/reverse`, '리버스'],
  [`${P}/members`, '멤버'],
  [`${P}/approvals`, '승인'],
  [`${P}/plan`, '결제'],
]
// 다국어 접두사(/en/… — @pi/i18n as-needed, ko 는 접두사 없음)는 떼고 비교. 최상위 화면(/link·/areas)은 2~3자 소문자가 아니라 겹치지 않음
const noLocale = (scr: string) => scr.replace(/^\/[a-z]{2,3}(?:-[A-Z]{2})?(?=\/|$)/, '') || '/'
export const pageMenu = (scr: string | null | undefined): string => {
  if (!scr) return '기타'
  const s = noLocale(scr)
  return PAGE.find(([p]) => s === p || (p !== '/' && s.startsWith(`${p}/`)))?.[1] ?? '기타'
}
