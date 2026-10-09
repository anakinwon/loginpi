// sitemap.pi Next 설정 — 빌드 시 env 검증(src/env) + next-intl 플러그인 + 모노레포 루트(Turbopack·파일 트레이싱) 지정
import './src/env'
import path from 'node:path'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

// 워크스페이스 패키지(packages/*)가 앱 폴더 밖이므로 저장소 루트를 기준으로 삼는다(cwd = 앱 폴더)
const repoRoot = path.resolve(process.cwd(), '../..')

// CSP 2단 — 강제(CSP)는 Pi sandbox(데스크톱 iframe)·Pi SDK 와 충돌 없는 지시어만, 나머지는 Report-Only 로 실측 후 강제 전환.
// frame-ancestors 는 Report-Only 에서도 제외 — Pi sandbox 가 앱을 iframe 으로 띄우므로 sandbox 도메인 확정 전엔 위반 보고만 쌓인다(KISA 2026-10-09 재점검 남은 이슈).
// Pi SDK = packages/pi-auth pi-sdk-script.tsx 의 src
const CSP_ENFORCED = ["object-src 'none'", "base-uri 'self'"].join('; ')
const CSP_REPORT_ONLY = [
  "script-src 'self' 'unsafe-inline' https://sdk.minepi.com",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ')

const nextConfig: NextConfig = {
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
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
