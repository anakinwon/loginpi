// schema.pi 프록시 — next-intl locale 접두사 처리만(as-needed, 감지·쿠키 끔 = Pi Browser 표준 6절). 인증 게이트와 섞지 않는다(redirect 금지 원칙).
// 앱 안 proxy 가 엔트리여야 저장소 루트 src/middleware.ts(cafe.pi)가 이 앱에 번들되지 않는다(next.config 주석) — 삭제 금지.
// API·정적 파일(점 포함 경로 — validation-key.txt·templates/*.xlsx)은 matcher 제외
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export const proxy = createMiddleware(routing)

export const config = { matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'] }
