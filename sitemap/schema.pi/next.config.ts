// schema.pi Next.js 설정 — 빌드 시 환경변수 스키마 검증(src/env.ts). 두 루트를 분리해 둔다:
//  · outputFileTracingRoot = 저장소 루트(loginpi) : Vercel 빌더(@vercel/next)가 모노레포 트레이싱 루트를 저장소 루트로 가정하고
//    relativeAppDir 로 .next 를 찾으므로, 앱 폴더로 두면 relativeAppDir='' 이 되어 /vercel/path0/.next ENOENT(dpl_24e59TuV)
//  · turbopack.root = 앱 폴더 : 미지정이면 Next 가 최상위 lockfile(loginpi)을 루트로 추론해 루트 src/middleware.ts(cafe.pi next-intl)를
//    이 앱의 미들웨어로 번들하고 / 를 /ko 로 rewrite 해 404(dpl_61fpJiSc). 앱 폴더로 고정하면 루트 미들웨어를 보지 않는다
import path from 'node:path'
import type { NextConfig } from 'next'
import './src/env'

const appRoot = path.resolve(process.cwd())
const repoRoot = path.resolve(appRoot, '../..')

const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot,
  turbopack: { root: appRoot },
}

export default nextConfig
