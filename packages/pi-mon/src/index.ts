// @pi/mon 공용(브라우저·서버) — API·화면 경로 정규화와 앱 서버 → schema.pi 수집 API 전달(2026-10-24 마스터 지시 : cafe.pi·sitemap.pi 모니터링)
// 새 시스템 연결 = ① 레이아웃에 <Rum send={…}/> ② /api/mon/app POST 에서 세션 확인 후 monForward(req, '<시스템코드>') ③ env MON_INGEST_URL·MON_INGEST_KEY ④ schema.pi sql 의 sys_cd CHECK·SYSTEMS 에 코드 추가

// 시스템코드(schema.pi mon_app_hist.sys_cd, sql/075 CHECK 와 같아야 함)
export const SYSTEMS = { SCHEMA: 'schema.pi', CAFE: 'cafe.pi', SITEMAP: 'sitemap.pi' } as const
export type SysCd = keyof typeof SYSTEMS
export const isSys = (v: unknown): v is SysCd => typeof v === 'string' && v in SYSTEMS

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
// /api/areas/<uuid>/terms?page=2 → /api/areas/:id/terms (질의 문자열·끝 슬래시 제거, 200자)
export function normRoute(url: string): string | null {
  const p = url.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0].replace(/\/+$/, '')
  if (!p.startsWith('/api/') || /\/mon(\/|$)/.test(p)) return null // 모니터링 자체(/api/mon/*·/api/areas/:id/mon/*)는 제외 — 화면 폴링이 앱 지표를 오염시키지 않게
  const r = p.replace(UUID, ':id').replace(/\/\d+(?=\/|$)/g, '/:id')
  return /^[\w\-/:.]{1,200}$/.test(r) ? r : null // 경로 문자만 허용(브라우저 보고값 = 신뢰 안 함, 임의 문자열 적재 방지)
}

// 화면 경로(location.pathname) → /areas/:id/terms (질의·해시·끝 슬래시 제거, UUID·숫자 → :id, 200자) — 브라우저 보고값이라 경로 문자만 허용
export function normPage(path: string): string | null {
  const p = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  if (!p.startsWith('/')) return null
  const r = p.replace(UUID, ':id').replace(/\/\d+(?=\/|$)/g, '/:id')
  return /^[\w\-/:.]{1,200}$/.test(r) ? r : null
}

// 브라우저 표본(Rum 이 보내는 모양) — r 요청 URL · t 끝난 시각(epoch ms) · ms 응답 · st 상태(0 = 네트워크 실패, 1 = 브라우저가 상태 미제공 = 오류 아님) · p 화면 경로
export type RawSample = { r: string; t: number; ms: number; st: number; p?: string }
export const MAX_SAMPLES = 500

// 운영 배포에서만 전달 — 앱 라우트가 세션 조회 전에 먼저 확인(로컬·미리보기에서 15초마다 세션 DB 조회 낭비 방지)
export const monOn = () => process.env.VERCEL_ENV === 'production' && !!process.env.MON_INGEST_URL && !!process.env.MON_INGEST_KEY

// 앱 서버 → schema.pi 수집 API 전달 — 호출 측이 로그인 세션을 확인한 뒤 부른다. 운영 배포만(로컬·미리보기는 운영 지표를 오염시키지 않게, schema.pi T2 사고)
//  실패해도 사용자 화면에 영향 없게 204, 외부 호출 2초 상한(R-P4)
export async function monForward(req: Request, sys: SysCd): Promise<Response> {
  const none = new Response(null, { status: 204 })
  if (!monOn()) return none
  const url = process.env.MON_INGEST_URL!
  const key = process.env.MON_INGEST_KEY!
  let s: unknown
  try {
    s = ((await req.json()) as { s?: unknown }).s
  } catch {
    return new Response(null, { status: 400 })
  }
  if (!Array.isArray(s) || !s.length) return none
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-mon-key': key },
    body: JSON.stringify({ sys, s: s.slice(-MAX_SAMPLES) }),
    signal: AbortSignal.timeout(2000),
  }).catch((e: unknown) => console.error('[mon] 전달 실패', sys, e instanceof Error ? e.message : e))
  return none
}
