// schema.pi Next.js 설정 — 빌드 시 환경변수 스키마 검증(src/env.ts), 상위 폴더(nia-dr-project)와 분리된 트레이싱 루트
import path from 'node:path'
import type { NextConfig } from 'next'
import './src/env'

const root = path.resolve(process.cwd())

const nextConfig: NextConfig = {
  outputFileTracingRoot: root,
  turbopack: { root },
}

export default nextConfig
