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

  // _pit 쿼리 파라미터 → x-pit-ticket 요청 헤더로 변환.
  // Pi Browser는 페이지 내비게이션(router.replace) 시 커스텀 헤더를 직접 첨부할 수 없으므로
  // ClientAdminGate가 /api/admin/pit-ticket에서 발급받은 60초짜리 HMAC ticket을
  // URL 파라미터로 전달하면 미들웨어가 서버 인증용 헤더로 전환한다.
  // (실제 세션 토큰이 아닌 단기 ticket이므로 URL 노출 위험이 제한된다.)
  const pit = req.nextUrl.searchParams.get('_pit')
  if (pit) {
    const cleanUrl = req.nextUrl.clone()
    cleanUrl.searchParams.delete('_pit')
    // intl 미들웨어에 _pit 없는 URL 전달 (locale 처리 정상 수행)
    const intlRes = intlMiddleware(new NextRequest(cleanUrl, { headers: req.headers, method: req.method }))
    // intl이 리다이렉트 결정(예: locale 미등록 → /en) 시 그대로 따름
    if (intlRes.headers.has('location')) return intlRes
    // intl이 설정한 요청 헤더(locale 정보 등) 추출 후 x-pit-ticket 병합
    const fwd = new Headers()
    for (const [k, v] of intlRes.headers.entries()) {
      // x-middleware-request-{name} → 서버 요청에서 {name} 헤더로 변환되는 Next.js 내부 규약
      if (k.startsWith('x-middleware-request-')) fwd.set(k.slice(21), v)
    }
    fwd.set('x-pit-ticket', pit)
    return NextResponse.next({ request: { headers: fwd } })
  }

  return intlMiddleware(req)
}

export const config = {
  // API 라우트, Next.js 내부, 정적 파일 제외
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
