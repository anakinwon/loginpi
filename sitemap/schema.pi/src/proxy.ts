// schema.pi 프록시(Next 16 middleware 후속) — 공격 도구 UA 차단·페이지 rate limit·보안 헤더 + next-intl locale 처리.
// API 라우트는 matcher 제외 → 각 라우트의 @pi/guard withGuard 가 처리
import createMiddleware from 'next-intl/middleware'
import { type NextRequest } from 'next/server'
import {
  applySecurityHeaders,
  checkRateLimit,
  forbiddenResponse,
  getClientIp,
  isMaliciousAgent,
  rateLimitedResponse,
} from '@pi/guard'
import { routing } from './i18n/routing'

const intlMiddleware = createMiddleware(routing)

export default function proxy(req: NextRequest) {
  if (isMaliciousAgent(req.headers.get('user-agent'))) {
    return forbiddenResponse('blocked_agent')
  }
  // 개발 환경은 HMR·반복 새로고침이 단일 IP에 몰리므로 차단 우회
  const rl = checkRateLimit(getClientIp(req), 'PAGE')
  if (process.env.NODE_ENV !== 'development' && !rl.allowed) {
    return rateLimitedResponse(rl.retryAfter)
  }
  const res = intlMiddleware(req)
  applySecurityHeaders(res)
  return res
}

// 점 포함 경로(정적 파일·validation-key.txt)·api·_next 제외
export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
