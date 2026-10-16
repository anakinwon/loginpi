// schema.pi Next.js 설정 — 빌드 시 환경변수 스키마 검증(src/env.ts), 모노레포 루트(loginpi) 기준 트레이싱
import path from 'node:path'
import type { NextConfig } from 'next'
import './src/env'

// Vercel 빌더(@vercel/next)는 트레이싱 루트를 저장소 루트로 가정하고 relativeAppDir 로 .next 를 찾는다.
// cwd(앱 폴더)를 루트로 두면 relativeAppDir='' 이 되어 /vercel/path0/.next 를 찾다 ENOENT — sitemap.pi 와 같이 저장소 루트를 쓴다
const repoRoot = path.resolve(process.cwd(), '../..')

const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
}

export default nextConfig
