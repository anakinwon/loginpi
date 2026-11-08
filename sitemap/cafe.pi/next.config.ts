// cafe.pi Next.js 설정 — 빌드 시 환경변수 스키마 검증(src/env.ts) + next-intl 플러그인. 두 루트를 분리해 둔다(schema.pi 와 같은 패턴):
//  · outputFileTracingRoot = 저장소 루트(loginpi) : Vercel 빌더(@vercel/next)가 모노레포 트레이싱 루트를 저장소 루트로 가정하고
//    relativeAppDir 로 .next 를 찾으므로, 앱 폴더로 두면 relativeAppDir='' 이 되어 /vercel/path0/.next ENOENT(dpl_24e59TuV)
//  · turbopack.root = 앱 폴더 : 미지정이면 Next 가 최상위 lockfile(loginpi)을 루트로 추론해 다른 앱의 파일을
//    이 앱의 것으로 번들할 수 있음(dpl_61fpJiSc — schema.pi 가 루트 src/middleware.ts 를 물어 / 404). 앱 폴더로 고정
import path from 'node:path'
import './src/env'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const appRoot = path.resolve(process.cwd())
const repoRoot = path.resolve(appRoot, '../..')

// Supabase Storage 이미지 허용 호스트를 실제 백엔드 URL에서 도출 — '*.supabase.co'
// 와일드카드(open image proxy)를 피하고 우리 프로젝트 서브도메인으로만 고정한다.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : undefined

const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot,
  turbopack: { root: appRoot },
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
  // 글롭은 tracing root 가 아니라 앱 폴더 기준으로 해석된다(schema.pi './src/**'·'./messages/*.json' 과 같은 방식)
  outputFileTracingIncludes: {
    '/[locale]/docs/agreement/lbs': ['./docs/law/agreement/**'],
    '/[locale]/docs/legal/[doc]': ['./docs/law/**'],
  },
}

export default withNextIntl(nextConfig)
