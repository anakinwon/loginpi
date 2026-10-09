// Pi Developer Portal 도메인 소유 검증 — /validation-key.txt 서빙. 키는 PI_DOMAIN_VALIDATION_KEY env로만 주입
// (포털 앱별 testnet≠mainnet 키가 달라 파일 커밋 대신 env). 미설정 시 404. proxy matcher가 점 포함 경로를 제외해 루트에서 응답
import { env } from '@/env'

export const dynamic = 'force-dynamic'

export function GET() {
  const key = env.PI_DOMAIN_VALIDATION_KEY?.trim()
  if (!key) return new Response('Not Found', { status: 404 })
  return new Response(key, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
