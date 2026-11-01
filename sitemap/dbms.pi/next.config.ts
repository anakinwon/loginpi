// dbms.pi Next 설정 — 빌드 시 env 검증(src/env) + next-intl 플러그인 + 모노레포 루트(Turbopack·파일 트레이싱) 지정
import './src/env'
import path from 'node:path'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

// 워크스페이스 패키지(packages/*)가 앱 폴더 밖이므로 저장소 루트를 기준으로 삼는다(cwd = 앱 폴더)
const repoRoot = path.resolve(process.cwd(), '../..')

const nextConfig: NextConfig = {
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  poweredByHeader: false,
  // Pi 도메인 검증 파일(앱 루트 validation-key.txt, 있을 때만)을 서버리스 번들에 포함 — src/app/validation-key.txt/route.ts 가 읽음
  // messages/*.json 은 @pi/i18n/server 가 readFile 로 읽으므로 전 경로 번들에 포함(빠지면 운영에서 ko 로만 보임 — 표준 7절 L9)
  outputFileTracingIncludes: {
    '/validation-key.txt': ['./validation-key.txt'],
    '/**/*': ['./messages/*.json'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "object-src 'none'; base-uri 'self'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // 카메라·마이크 기능 없음 — 전부 차단
          { key: 'Permissions-Policy', value: 'camera=(), microphone=()' },
        ],
      },
    ]
  },
}

export default withNextIntl(nextConfig)
