import { env } from '@/env'

// Pi Developer Portal 도메인 소유 검증(MAINNET_READINESS B-1-12) — /validation-key.txt 서빙.
// 키는 PI_DOMAIN_VALIDATION_KEY env로만 주입: 포털 프로젝트별(staging≠운영·testnet≠mainnet)
// 키가 달라 파일 커밋 대신 Vercel 환경변수로 분리한다. 미설정 환경은 404(검증 미진행 정상).
// 미들웨어 matcher가 점(.) 포함 경로를 제외하므로 locale 리다이렉트 없이 루트에서 응답한다.
export const dynamic = 'force-dynamic'

export function GET() {
  const key = env.PI_DOMAIN_VALIDATION_KEY?.trim()
  if (!key) {
    return new Response('Not Found', { status: 404 })
  }
  return new Response(key, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
