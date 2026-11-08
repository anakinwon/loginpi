import 'server-only'
import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from './supabase-admin'
import { isReadOnlyDb } from './db-env'

// 실시간 모니터링 — API 응답 계측 (PRD_22_MONITOR)
// 원칙: fire-and-forget. 절대 throw하지 않고 요청 경로에 0 영향(비블로킹).
//       Next.js middleware는 응답 status·소요시간을 볼 수 없어 route 래퍼로 측정한다.

// IP 유효성 (INET 컬럼 — IPv4/IPv6 형태만 통과, 그 외 null → INET 에러 방지)
function validIp(ip?: string | null): string | null {
  if (!ip) return null
  const v = ip.trim()
  if (!v) return null
  if (/^[0-9.]+$/.test(v) || /^[0-9a-fA-F:]+$/.test(v)) return v
  return null
}

// 비블로킹 기록 — 에러는 완전히 삼킨다(계측 실패가 요청에 영향 X)
export function recordApiMetric(m: {
  endpoint: string
  method: string
  status: number
  ms: number
  ip?: string | null
}): void {
  if (isReadOnlyDb()) return // 읽기전용 모드: 계측 쓰기 스킵
  void getSupabaseAdmin()
    .from('sys_metric_req_perf')
    .insert({
      endpoint: m.endpoint.slice(0, 300),
      http_mthd: m.method.slice(0, 8),
      status_code: m.status,
      resp_time_ms: Math.round(m.ms),
      ip_addr: validIp(m.ip),
      regr_id: 'SYSTEM',
      modr_id: 'SYSTEM',
    })
    .then(
      () => {},
      () => {}, // 에러 무시
    )
}

type RouteHandler<T = unknown> = (
  req: NextRequest,
  ctx: T,
) => Promise<Response> | Response

// API route 핸들러를 감싸 응답 status·소요시간을 비블로킹 계측한다.
// 사용: export const POST = withMetric(async (req) => { ... })
export function withMetric<T = unknown>(
  handler: RouteHandler<T>,
): RouteHandler<T> {
  return async (req: NextRequest, ctx: T) => {
    const start = Date.now()
    let status = 500
    try {
      const res = await handler(req, ctx)
      status = res.status
      return res
    } finally {
      recordApiMetric({
        endpoint: new URL(req.url).pathname,
        method: req.method,
        status,
        ms: Date.now() - start,
        ip: req.headers.get('x-forwarded-for')?.split(',')[0] ?? null,
      })
    }
  }
}
