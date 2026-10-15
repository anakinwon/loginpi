// Pi Developer Portal 도메인 소유 검증 — /validation-key.txt 서빙(sitemap.pi 동일).
//  1순위 PI_DOMAIN_VALIDATION_KEY env, 2순위 앱 루트의 validation-key.txt 파일(커밋 — 공개 값). 둘 다 없으면 404
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
