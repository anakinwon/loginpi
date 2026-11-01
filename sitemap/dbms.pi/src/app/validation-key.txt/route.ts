// Pi Developer Portal 도메인 소유 검증 — /validation-key.txt 서빙.
//  1순위 PI_DOMAIN_VALIDATION_KEY env(운영 mainnet 앱 키 — testnet≠mainnet 이라 환경별 주입),
//  2순위 앱 루트의 validation-key.txt 파일(testnet 앱 키, 커밋 — 검증 키는 공개 파일이라 비밀 아님. next.config outputFileTracingIncludes 로 번들 포함).
//  둘 다 없으면 404. proxy matcher 가 점 포함 경로를 제외해 루트에서 응답
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { env } from '@/env'

export const dynamic = 'force-dynamic'

export async function GET() {
  let key = env.PI_DOMAIN_VALIDATION_KEY?.trim()
  if (!key) {
    try {
      key = (
        await readFile(path.join(process.cwd(), 'validation-key.txt'), 'utf8')
      ).trim()
    } catch {
      key = undefined
    }
  }
  if (!key) return new Response('Not Found', { status: 404 })
  return new Response(key, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
