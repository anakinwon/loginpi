import createMiddleware from 'next-intl/middleware'
import { NextRequest, NextResponse } from 'next/server'
import { routing } from './i18n/routing'

const intlMiddleware = createMiddleware(routing)
const supportedLocales = new Set<string>(routing.locales)

// BCP 47 locale 세그먼트 패턴: "au", "en-AU", "zh-CN" 등
const LOCALE_SEGMENT_RE = /^[a-z]{2,3}(-[a-zA-Z]{2,4})?$/

// 2~3글자여서 locale 패턴에 매칭되지만 실제 앱 라우트인 세그먼트 목록
// localePrefix: 'as-needed'이면 기본 locale(ko)은 프리픽스 없이 /map 등으로 접근 →
// LOCALE_SEGMENT_RE에 걸려 /en/으로 리다이렉트되는 것을 방지
const APP_ROUTE_SEGMENTS = new Set(['map'])

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const firstSegment = pathname.split('/')[1] ?? ''

  // DB에서 활성화됐지만 routing.ts에 아직 등록되지 않은 locale
  // → 404 대신 영어 경로로 폴백 리다이렉트 ("번역 미완료 시 영어 표시" 요건 구현)
  if (
    LOCALE_SEGMENT_RE.test(firstSegment) &&
    !supportedLocales.has(firstSegment) &&
    !APP_ROUTE_SEGMENTS.has(firstSegment)
  ) {
    const rest = pathname.slice(firstSegment.length + 1) // 남은 경로 ('/board' 등)
    return NextResponse.redirect(new URL('/en' + (rest || '/'), req.url))
  }

  // _pit 쿼리 파라미터 → x-pit-ticket 요청 헤더로 변환.
  // Pi Browser는 페이지 내비게이션 시 커스텀 헤더를 직접 첨부할 수 없으므로, ClientAdminGate가
  // /api/admin/pit-ticket에서 발급받은 60초짜리 HMAC ticket을 URL 파라미터로 전달하면
  // 미들웨어가 서버 인증용 헤더로 전환한다. (단기 ticket이라 URL 노출 위험 제한)
  //
  // 중요: x-pit-ticket을 원본 요청 헤더에 추가한 뒤 intl 미들웨어에 위임한다.
  //   직접 NextResponse.next로 헤더를 재구성하면 원본 헤더(host·locale 등)가 누락돼
  //   비기본 locale(prefix 보유, 예: /ja/admin) admin 렌더가 깨지는 문제가 있었다.
  //   intl에 위임하면 헤더 보존 + locale 처리(redirect 포함)를 일관되게 맡길 수 있다.
  const pit = req.nextUrl.searchParams.get('_pit')
  if (pit) {
    const cleanUrl = req.nextUrl.clone()
    cleanUrl.searchParams.delete('_pit')
    const reqHeaders = new Headers(req.headers)
    reqHeaders.set('x-pit-ticket', pit)
    return intlMiddleware(
      new NextRequest(cleanUrl, { headers: reqHeaders, method: req.method }),
    )
  }

  return intlMiddleware(req)
}

export const config = {
  // API 라우트, Next.js 내부, 정적 파일 제외
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
