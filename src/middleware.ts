import createMiddleware from 'next-intl/middleware'
import { NextRequest, NextResponse } from 'next/server'
import { routing } from './i18n/routing'
import {
  checkRateLimit,
  forbiddenResponse,
  getClientIp,
  getPolicyForPath,
  isMaliciousAgent,
  rateLimitedResponse,
  SECURITY_HEADERS,
} from './lib/ddos-guard'

const intlMiddleware = createMiddleware(routing)
const supportedLocales = new Set<string>(routing.locales)

// BCP 47 locale 세그먼트 패턴: "au", "en-AU", "zh-CN" 등
const LOCALE_SEGMENT_RE = /^[a-z]{2,3}(-[a-zA-Z]{2,4})?$/

// 2~3글자여서 locale 패턴에 매칭되지만 실제 앱 라우트인 세그먼트 목록
const APP_ROUTE_SEGMENTS = new Set(['map'])

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const ua = req.headers.get('user-agent')
  const ip = getClientIp(req)

  // ── 1단계: 알려진 공격 도구 UA 즉시 차단 ──────────────────────────────────
  if (isMaliciousAgent(ua)) {
    return forbiddenResponse('blocked_agent')
  }

  // ── 2단계: Rate limiting (페이지 라우트) ──────────────────────────────────
  // API 라우트는 matcher 제외 → src/lib/api-guard.ts에서 처리
  const policy = getPolicyForPath(pathname)
  const rl = checkRateLimit(ip, policy)
  if (!rl.allowed) {
    return rateLimitedResponse(rl.retryAfter)
  }

  // ── 3단계: i18n 처리 (기존 로직 유지) ────────────────────────────────────
  const firstSegment = pathname.split('/')[1] ?? ''

  // DB에서 활성화됐지만 routing.ts에 아직 등록되지 않은 locale
  // → 404 대신 영어 경로로 폴백 리다이렉트
  if (
    LOCALE_SEGMENT_RE.test(firstSegment) &&
    !supportedLocales.has(firstSegment) &&
    !APP_ROUTE_SEGMENTS.has(firstSegment)
  ) {
    const rest = pathname.slice(firstSegment.length + 1)
    const res = NextResponse.redirect(new URL('/en' + (rest || '/'), req.url))
    applySecurityHeaders(res)
    return res
  }

  // _pit 쿼리 파라미터 → x-pit-ticket 요청 헤더로 변환
  const pit = req.nextUrl.searchParams.get('_pit')
  if (pit) {
    const cleanUrl = req.nextUrl.clone()
    cleanUrl.searchParams.delete('_pit')
    const reqHeaders = new Headers(req.headers)
    reqHeaders.set('x-pit-ticket', pit)
    // Rate-Limit 잔여량 헤더 첨부
    reqHeaders.set('x-ratelimit-remaining', String(rl.remaining))
    const res = intlMiddleware(
      new NextRequest(cleanUrl, { headers: reqHeaders, method: req.method }),
    )
    if (res) applySecurityHeaders(res)
    return res
  }

  const res = intlMiddleware(req)
  if (res) applySecurityHeaders(res)
  return res
}

function applySecurityHeaders(res: NextResponse) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(k, v)
  }
}

export const config = {
  // API 라우트, Next.js 내부, 정적 파일 제외 (API 라우트는 api-guard.ts에서 보호)
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
