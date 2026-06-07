import createMiddleware from 'next-intl/middleware'
import { NextRequest, NextResponse } from 'next/server'
import { routing } from './i18n/routing'

const intlMiddleware = createMiddleware(routing)
const supportedLocales = new Set<string>(routing.locales)

// BCP 47 locale 세그먼트 패턴: "au", "en-AU", "zh-CN" 등
const LOCALE_SEGMENT_RE = /^[a-z]{2,3}(-[a-zA-Z]{2,4})?$/

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const firstSegment = pathname.split('/')[1] ?? ''

  // DB에서 활성화됐지만 routing.ts에 아직 등록되지 않은 locale
  // → 404 대신 영어 경로로 폴백 리다이렉트 ("번역 미완료 시 영어 표시" 요건 구현)
  if (LOCALE_SEGMENT_RE.test(firstSegment) && !supportedLocales.has(firstSegment)) {
    const rest = pathname.slice(firstSegment.length + 1) // 남은 경로 ('/board' 등)
    return NextResponse.redirect(new URL('/en' + (rest || '/'), req.url))
  }

  return intlMiddleware(req)
}

export const config = {
  // API 라우트, Next.js 내부, 정적 파일 제외
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
