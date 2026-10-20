// 모니터링 공용 순수 로직(2026-10-21, sql/068) — 브라우저·서버 공용(서버 전용 기능 없음)
// 경로 정규화(UUID·숫자 → :id), 응답 표본 → 분 × 경로 묶음, 누적 카운터 → 구간 초당 값, HTTP 상태 분류
export const SLOW_MS = 1000 // 느림 기준(1초)
export const KEEP_DAYS = 7 // 이력 보관

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
// /api/areas/<uuid>/terms?page=2 → /api/areas/:id/terms (질의 문자열·끝 슬래시 제거, 200자)
export function normRoute(url: string): string | null {
  const p = url.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0].replace(/\/+$/, '')
  if (!p.startsWith('/api/') || /\/mon(\/|$)/.test(p)) return null // 모니터링 자체(/api/mon/*·/api/areas/:id/mon/*)는 제외 — 화면 폴링이 앱 지표를 오염시키지 않게
  const r = p.replace(UUID, ':id').replace(/\/\d+(?=\/|$)/g, '/:id')
  return /^[\w\-/:.]{1,200}$/.test(r) ? r : null // 경로 문자만 허용(브라우저 보고값 = 신뢰 안 함, 임의 문자열 적재 방지)
}

export const minuteOf = (t: number) => new Date(Math.floor(t / 60000) * 60000).toISOString()

export interface Sample {
  route: string
  t: number // 끝난 시각(epoch ms)
  ms: number
  status: number // 0 = 네트워크 실패·알 수 없음
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
