// seminar.pi Next 설정 — 빌드 시 env 검증(src/env) + next-intl 플러그인 + 모노레포 루트(Turbopack·파일 트레이싱) 지정
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
  // Pi 도메인 검증 파일(testnet 키)을 서버리스 번들에 포함 — src/app/validation-key.txt/route.ts 가 읽음
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
          // 화상 세미나 — 카메라·마이크는 자기 출처에서만 허용
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self)' },
        ],
      },
      // 배경 효과 MediaPipe(wasm 26.8MB·모델) — 장기 캐시(설계 15.15, R-P4). wasm 은 버전 경로(/mediapipe/wasm/<버전>), 모델은 바꿀 때 파일명을 바꾼다
      {
        source: '/mediapipe/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ]
  },
}

export default withNextIntl(nextConfig)
