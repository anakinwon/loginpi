// seminar.pi 환경변수 스키마(t3-env) — next.config.ts 가 import 해 빌드 시점에 검증. 키 추가 시 .env.example 동시 수정
import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  server: {
    // M0 실험실(/lab/*) 운영 배포 허용 스위치 — '1' 일 때만 운영 빌드에서 열림(R-P6). 실기기 시험 끝나면 Vercel 에서 제거
    LAB_ENABLED: z.enum(['1']).optional(),
    // Developer Portal 도메인 소유 검증 키 — 1순위(운영 mainnet 키), 없으면 앱 루트 validation-key.txt(testnet 키) 서빙
    PI_DOMAIN_VALIDATION_KEY: z.string().optional(),
  },
  client: {
    // M0 기기 2대 연결 시그널링 = Supabase Realtime broadcast(테이블 미사용). 비운영 pi-nonprod 프로젝트 값
    NEXT_PUBLIC_LAB_SUPABASE_URL: z.url().optional(),
    NEXT_PUBLIC_LAB_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  },
  runtimeEnv: {
    LAB_ENABLED: process.env.LAB_ENABLED,
    PI_DOMAIN_VALIDATION_KEY: process.env.PI_DOMAIN_VALIDATION_KEY,
    NEXT_PUBLIC_LAB_SUPABASE_URL: process.env.NEXT_PUBLIC_LAB_SUPABASE_URL,
    NEXT_PUBLIC_LAB_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_LAB_SUPABASE_PUBLISHABLE_KEY,
  },
  emptyStringAsUndefined: true,
})
