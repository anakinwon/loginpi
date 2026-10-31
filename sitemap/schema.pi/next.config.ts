// schema.pi Next.js 설정 — 빌드 시 환경변수 스키마 검증(src/env.ts) + next-intl 플러그인. 두 루트를 분리해 둔다:
//  · outputFileTracingRoot = 저장소 루트(loginpi) : Vercel 빌더(@vercel/next)가 모노레포 트레이싱 루트를 저장소 루트로 가정하고
//    relativeAppDir 로 .next 를 찾으므로, 앱 폴더로 두면 relativeAppDir='' 이 되어 /vercel/path0/.next ENOENT(dpl_24e59TuV)
//  · turbopack.root = 앱 폴더 : 미지정이면 Next 가 최상위 lockfile(loginpi)을 루트로 추론해 루트 src/middleware.ts(cafe.pi next-intl)를
//    이 앱의 미들웨어로 번들하고 / 를 /ko 로 rewrite 해 404(dpl_61fpJiSc). 앱 폴더로 고정하면 루트 미들웨어를 보지 않는다
import path from 'node:path'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import './src/env'

// 다국어(@pi/i18n 표준, docs/I18N_STANDARD.md) — 요청별 메시지 설정
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const appRoot = path.resolve(process.cwd())
const repoRoot = path.resolve(appRoot, '../..')

const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot,
  turbopack: { root: appRoot },
  // DDL 서버 직접 실행(src/lib/db-exec.ts) — Oracle 드라이버는 번들하지 않고 node_modules 에서 불러옴(동적 require·선택 바이너리)
  serverExternalPackages: ['oracledb'],
  // 모니터링 AI 원인 분석(src/lib/mon-ai.ts)이 실행 중 소스를 읽어 Claude 에 근거로 보냄 — 배포 함수에 src 를 포함
  // messages/*.json 은 @pi/i18n/server 가 readFile 로 읽으므로 전 경로 번들에 포함(빠지면 운영에서 ko 로만 보임 — 표준 7절 L9)
  outputFileTracingIncludes: { '/api/mon/app/analyze': ['./src/**/*.ts', './src/**/*.tsx'], '/**/*': ['./messages/*.json'] },
  // Google 버튼 플래그 = 서버 3종(src/auth.ts googleEnabled)에서 빌드 때 파생 — Vercel 에 NEXT_PUBLIC_GOOGLE_LOGIN 을 빠뜨리면
  // 서버는 활성인데 버튼이 숨던 운영 사고(2026-10-18 schem.vercel.app) 방지. 직접 설정한 값이 있으면 그 값 우선
  env: {
    NEXT_PUBLIC_GOOGLE_LOGIN:
      process.env.NEXT_PUBLIC_GOOGLE_LOGIN ?? (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.AUTH_SECRET ? '1' : ''),
  },
}

export default withNextIntl(nextConfig)
