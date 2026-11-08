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
import { recordApiMetric } from './monitor-metric'

// ────────────────────────────────────────────────────────────────────────────
// API 라우트 DDoS 가드 래퍼
//
// 사용법:
//   import { withGuard } from '@/lib/api-guard'
//   export const GET = withGuard(async (req) => { ... })
//
// 고위험 엔드포인트(인증·결제)에는 반드시 적용.
// ────────────────────────────────────────────────────────────────────────────

type Handler = (
  req: NextRequest,
  ctx?: unknown,
) => Promise<NextResponse> | NextResponse

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
          {
            status: 413,
            headers: {
              'Content-Type': 'application/json',
              ...SECURITY_HEADERS,
            },
          },
        )
      }
    }

    // 3) Rate limiting
    const policy = getPolicyForPath(pathname)
    const rl = checkRateLimit(ip, policy)
    if (!rl.allowed) {
      return rateLimitedResponse(rl.retryAfter)
    }

    // 4) 핸들러 실행 + 응답 계측 (비블로킹 — 실패해도 요청에 영향 0)
    const start = Date.now()
    let res: NextResponse
    try {
      res = await handler(req, ctx)
    } catch (e) {
      recordApiMetric({
        endpoint: pathname,
        method: req.method,
        status: 500,
        ms: Date.now() - start,
        ip,
      })
      throw e
    }
    recordApiMetric({
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

// 인증 엔드포인트 전용 — 더 엄격한 검사 추가
export function withAuthGuard(handler: Handler): Handler {
  return withGuard(async (req: NextRequest, ctx?: unknown) => {
    const origin = req.headers.get('origin')
    if (origin) {
      // Origin이 있을 때 정확한 hostname 비교
      // ⚠️ origin.includes(host) 방식은 substring bypass 가능:
      //    evil-cafe.pi.attacker.com 이 cafe.pi를 포함하므로 통과됨
      const host = req.headers.get('host')
      try {
        const originHostname = new URL(origin).hostname
        // ① same-origin 우선: 요청이 실제 도달한 Host와 Origin의 hostname이 같으면 허용.
        //    도메인이 무엇이든(운영 cafepi.vercel.app·Pi 포워딩 cafe7092.pinet.com·스테이징)
        //    동일 소스/동일 env로 동작한다. NEXT_PUBLIC_APP_URL은 빌드타임 인라인 값이라
        //    환경마다 달라야 하므로, 인증 게이트를 여기에 묶으면 통짜 배포 시 일반 브라우저가
        //    403 cross_origin_auth로 막힌다(Origin≠NEXT_PUBLIC_APP_URL 사고).
        // ② 추가 허용: 명시적으로 신뢰하는 앱 도메인(의도된 cross-origin 대비).
        //    CSRF 방어는 유지된다 — 외부 사이트는 피해자 브라우저의 Origin을 위조할 수 없다.
        const hostHostname = host?.split(':')[0] ?? ''
        const appUrl = process.env.NEXT_PUBLIC_APP_URL
        const appHostname = appUrl ? new URL(appUrl).hostname : ''
        const allowed =
          (!!hostHostname && originHostname === hostHostname) ||
          (!!appHostname && originHostname === appHostname)
        if (!allowed) {
          return forbiddenResponse('cross_origin_auth')
        }
      } catch {
        // URL 파싱 실패 = 비정상 Origin → 차단
        return forbiddenResponse('cross_origin_auth')
      }
    }
    // Origin 없음: Pi Browser 직접 API 호출·서버-투-서버 → 허용
    // (X-Pi-Token 유효성 검증은 핸들러 내부 getSessionUser()에서 수행)
    return handler(req, ctx)
  })
}
