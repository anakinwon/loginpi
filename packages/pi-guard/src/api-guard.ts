// @pi/guard — API 라우트 가드 래퍼(withGuard·withAuthGuard). 고위험 엔드포인트(인증·결제)엔 반드시 적용.
// 출처: cafe.pi src/lib/api-guard.ts 복사 추출. 계측(recordApiMetric 등 DB 쓰기)은 onMetric 콜백 주입, 기본 no-op.
// 사용: export const GET = withGuard(async (req) => { ... }, { onMetric })
import { NextRequest, NextResponse } from 'next/server'
import {
  checkRateLimit,
  forbiddenResponse,
  getClientIp,
  getPolicyForPath,
  isMaliciousAgent,
  rateLimitedResponse,
  SECURITY_HEADERS,
} from './ddos-guard'

export type Handler = (
  req: NextRequest,
  ctx?: unknown,
) => Promise<NextResponse> | NextResponse

export interface ApiMetric {
  endpoint: string
  method: string
  status: number
  ms: number
  ip: string
}

export interface GuardOptions {
  // 응답 계측 콜백 — 비블로킹으로 호출하고 실패해도 요청에 영향 0이어야 한다
  onMetric?: (metric: ApiMetric) => void
  // 요청 바디 최대 바이트 — 경로 기본값(MAX_BODY_SIZE) 대신 적용(예: 이미지 업로드 라우트)
  maxBodySize?: number
}

// 요청 바디 최대 크기(바이트) — 대용량 페이로드 공격 차단
const MAX_BODY_SIZE: Record<string, number> = {
  '/api/auth/pi': 4_096,
  '/api/payments/': 8_192,
  DEFAULT: 65_536,
}

function getMaxBodySize(pathname: string): number {
  for (const [prefix, size] of Object.entries(MAX_BODY_SIZE)) {
    if (prefix !== 'DEFAULT' && pathname.startsWith(prefix)) return size
  }
  return MAX_BODY_SIZE.DEFAULT
}

function emit(opts: GuardOptions | undefined, metric: ApiMetric) {
  try {
    opts?.onMetric?.(metric)
  } catch {
    // 계측 실패는 요청에 영향 주지 않는다
  }
}

export function withGuard(handler: Handler, opts?: GuardOptions): Handler {
  return async (req: NextRequest, ctx?: unknown) => {
    const pathname = req.nextUrl.pathname
    const ip = getClientIp(req)

    // 1) 악성 봇 UA 차단
    if (isMaliciousAgent(req.headers.get('user-agent'))) {
      return forbiddenResponse('blocked_agent')
    }

    // 2) Content-Length 초과 → 413
    const cl = req.headers.get('content-length')
    if (cl && Number(cl) > (opts?.maxBodySize ?? getMaxBodySize(pathname))) {
      return new NextResponse(JSON.stringify({ error: 'payload_too_large' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS },
      })
    }

    // 3) Rate limiting
    const rl = checkRateLimit(ip, getPolicyForPath(pathname))
    if (!rl.allowed) return rateLimitedResponse(rl.retryAfter)

    // 4) 핸들러 실행 + 응답 계측
    const start = Date.now()
    let res: NextResponse
    try {
      res = await handler(req, ctx)
    } catch (e) {
      emit(opts, {
        endpoint: pathname,
        method: req.method,
        status: 500,
        ms: Date.now() - start,
        ip,
      })
      throw e
    }
    emit(opts, {
      endpoint: pathname,
      method: req.method,
      status: res.status,
      ms: Date.now() - start,
      ip,
    })

    // 5) 보안 헤더 부착
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      res.headers.set(k, v)
    }
    res.headers.set('X-RateLimit-Remaining', String(rl.remaining))
    return res
  }
}

// 인증 엔드포인트 전용 — Origin hostname 정확 비교(CSRF) 추가
export function withAuthGuard(handler: Handler, opts?: GuardOptions): Handler {
  return withGuard(async (req: NextRequest, ctx?: unknown) => {
    const origin = req.headers.get('origin')
    if (origin) {
      // ⚠️ origin.includes(host) 방식은 substring bypass 가능 → hostname 정확 비교.
      // ① same-origin(요청 Host = Origin hostname) 우선 — 도메인·환경 무관 동작
      // ② NEXT_PUBLIC_APP_URL hostname 추가 허용(의도된 cross-origin)
      try {
        const originHostname = new URL(origin).hostname
        const hostHostname = req.headers.get('host')?.split(':')[0] ?? ''
        const appUrl = process.env.NEXT_PUBLIC_APP_URL
        const appHostname = appUrl ? new URL(appUrl).hostname : ''
        const allowed =
          (!!hostHostname && originHostname === hostHostname) ||
          (!!appHostname && originHostname === appHostname)
        if (!allowed) return forbiddenResponse('cross_origin_auth')
      } catch {
        return forbiddenResponse('cross_origin_auth')
      }
    }
    // Origin 없음: Pi Browser 직접 호출·서버-투-서버 → 허용(토큰 검증은 핸들러가 수행)
    return handler(req, ctx)
  }, opts)
}
