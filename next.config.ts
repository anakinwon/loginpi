import './src/env'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

// Supabase Storage 이미지 허용 호스트를 실제 백엔드 URL에서 도출 — '*.supabase.co'
// 와일드카드(open image proxy)를 피하고 우리 프로젝트 서브도메인으로만 고정한다.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : undefined

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      // Supabase Storage public 이미지만 — 프로젝트 호스트로 고정 (env 미설정 시 패턴 제외)
      ...(supabaseHost
        ? [
            {
              protocol: 'https' as const,
              hostname: supabaseHost,
              pathname: '/storage/v1/object/public/**',
            },
          ]
        : []),
    ],
  },
  // 약관 페이지가 readFile로 읽는 docs/law 마크다운을 Vercel 서버 번들에 포함
  outputFileTracingIncludes: {
    '/[locale]/docs/agreement/lbs': ['./docs/law/agreement/**'],
  },
}

export default withNextIntl(nextConfig)
