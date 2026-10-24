// seminar.pi 프록시(Next 16 middleware 후속) — next-intl locale 처리만(M0 최소). 공격 UA 차단·rate limit(@pi/guard)은 M1 에서 sitemap.pi 와 같게 붙인다
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export default createMiddleware(routing)

// API·정적 파일(점 포함 경로)은 제외
export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
