import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export default createMiddleware(routing)

export const config = {
  // API 라우트, Next.js 내부, 정적 파일 제외
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
