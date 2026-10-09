// sitemap.pi 프록시(Next 16 middleware 후속) — 공격 도구 UA 차단·페이지 rate limit·보안 헤더 + next-intl locale 처리.
// API 라우트는 matcher 제외 → 각 라우트의 @pi/guard withGuard가 처리(예외 : /api/sites/<domain> 인코딩 검사만)
import createMiddleware from 'next-intl/middleware'
import { NextResponse, type NextRequest } from 'next/server'
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
  // /api/sites/<domain> 잘못된 퍼센트 인코딩 — Next 가 라우트 파라미터 디코딩 단계에서 500(text/plain)을 내므로 여기서 404(KISA 2026-10-09 재점검)
  if (req.nextUrl.pathname.startsWith('/api/')) {
    try {
      decodeURIComponent(req.nextUrl.pathname)
    } catch {
      return NextResponse.json(
        { error: '대상을 찾을 수 없습니다', code: 'NOT_FOUND' },
        { status: 404 },
      )
    }
    return NextResponse.next()
  }
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

// 점 포함 경로(정적 파일·validation-key.txt)는 제외하되, 상세 /s/<domain>.pi 는 점이 있어도 locale 처리 대상
export const config = {
  matcher: [
    '/((?!api|_next|_vercel|.*\\..*).*)',
    '/s/:path*',
    '/(ko|en)/s/:path*',
    '/api/sites/:path+',
  ],
}
