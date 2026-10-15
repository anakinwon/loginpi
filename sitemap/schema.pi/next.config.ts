// schema.pi Next 설정 — 빌드 시 env 검증(src/env) + next-intl 플러그인 + 모노레포 루트(Turbopack·파일 트레이싱) 지정. sitemap.pi 와 같은 골격
import './src/env'
import path from 'node:path'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

// 워크스페이스 패키지(packages/*)가 앱 폴더 밖이므로 저장소 루트를 기준으로 삼는다(cwd = 앱 폴더)
const repoRoot = path.resolve(process.cwd(), '../..')

// CSP 2단 — 강제는 Pi sandbox·Pi SDK 와 충돌 없는 지시어만, 나머지는 Report-Only 로 실측 후 강제 전환(sitemap.pi 동일)
const CSP_ENFORCED = ["object-src 'none'", "base-uri 'self'"].join('; ')
const CSP_REPORT_ONLY = [
  "script-src 'self' 'unsafe-inline' https://sdk.minepi.com",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ')

const nextConfig: NextConfig = {
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  // Portal 도메인 검증 키 파일(앱 루트, env 미설정 시 폴백)을 서버리스 번들에 포함
  outputFileTracingIncludes: {
    '/validation-key.txt': ['./validation-key.txt'],
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP_ENFORCED },
          {
            key: 'Content-Security-Policy-Report-Only',
            value: CSP_REPORT_ONLY,
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ]
  },
}

export default withNextIntl(nextConfig)
