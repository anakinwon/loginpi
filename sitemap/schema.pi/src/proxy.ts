// schema.pi 프록시 — 요청 가공 없음(NextResponse.next). 존재 이유 : next.config 의 outputFileTracingRoot 가 저장소 루트(loginpi)라
// Next 16(Turbopack)이 루트 src/middleware.ts(cafe.pi next-intl, 189 locale)를 이 앱의 미들웨어로 잡아 / 를 /ko 로 rewrite 해 404 가 난다.
// 앱 안에 proxy 가 있으면 그것이 엔트리가 되어 루트 미들웨어가 번들되지 않는다. matcher 는 실제 요청과 겹치지 않는 경로 하나만
import { NextResponse } from 'next/server'

export function proxy() {
  return NextResponse.next()
}

export const config = { matcher: ['/__proxy_noop__'] }
