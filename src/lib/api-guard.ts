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

// ────────────────────────────────────────────────────────────────────────────
// API 라우트 DDoS 가드 래퍼
//
// 사용법:
//   import { withGuard } from '@/lib/api-guard'
//   export const GET = withGuard(async (req) => { ... })
//
// 고위험 엔드포인트(인증·결제)에는 반드시 적용.
// ────────────────────────────────────────────────────────────────────────────

type Handler = (req: NextRequest, ctx?: unknown) => Promise<NextResponse> | NextResponse

// 요청 바디 최대 크기 (바이트). 대용량 페이로드 공격 차단
const MAX_BODY_SIZE: Record<string, number> = {
  '/api/auth/pi': 4_096, // 4KB
  '/api/payments/': 8_192, // 8KB
  '/api/board/': 102_400, // 100KB (게시판 파일 업로드)
  DEFAULT: 65_536, // 64KB
}

function getMaxBodySize(pathname: string): number {
  for (const [prefix, size] of Object.entries(MAX_BODY_SIZE)) {
    if (prefix !== 'DEFAULT' && pathname.startsWith(prefix)) return size
  }
  return MAX_BODY_SIZE.DEFAULT
}

export function withGuard(handler: Handler): Handler {
  return async (req: NextRequest, ctx?: unknown) => {
    const pathname = req.nextUrl.pathname
    const ip = getClientIp(req)
    const ua = req.headers.get('user-agent')

    // 1) 악성 봇 UA 차단
    if (isMaliciousAgent(ua)) {
      return forbiddenResponse('blocked_agent')
    }

    // 2) Content-Length 초과 → 413
    const cl = req.headers.get('content-length')
    if (cl) {
      const maxSize = getMaxBodySize(pathname)
      if (Number(cl) > maxSize) {
        return new NextResponse(
          JSON.stringify({ error: 'payload_too_large' }),
          { status: 413, headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS } },
        )
      }
    }

    // 3) Rate limiting
    const policy = getPolicyForPath(pathname)
    const rl = checkRateLimit(ip, policy)
    if (!rl.allowed) {
      return rateLimitedResponse(rl.retryAfter)
    }

    // 4) 핸들러 실행
    const res = await handler(req, ctx)

    // 5) 보안 헤더 부착
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      res.headers.set(k, v)
    }
    res.headers.set('X-RateLimit-Remaining', String(rl.remaining))

    return res
  }
}

// 인증 엔드포인트 전용 — 더 엄격한 검사 추가
export function withAuthGuard(handler: Handler): Handler {
  return withGuard(async (req: NextRequest, ctx?: unknown) => {
    // 빈 Origin 헤더 = 직접 HTTP 요청(브라우저 외) 가능성 → 허용하되 로그
    const origin = req.headers.get('origin')
    const host = req.headers.get('host')
    if (origin && host && !origin.includes(host.split(':')[0])) {
      // Cross-origin 인증 시도 — 차단
      return forbiddenResponse('cross_origin_auth')
    }
    return handler(req, ctx)
  })
}
