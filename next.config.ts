import './src/env'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  // 약관 페이지가 readFile로 읽는 docs/law 마크다운을 Vercel 서버 번들에 포함
  outputFileTracingIncludes: {
    '/[locale]/docs/agreement/lbs': ['./docs/law/agreement/**'],
  },
}

export default withNextIntl(nextConfig)
