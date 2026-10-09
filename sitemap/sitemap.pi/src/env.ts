// sitemap.pi 환경변수 스키마(t3-env) — next.config.ts가 import해 빌드 시점 검증.
// SKIP_ENV_VALIDATION=1이면 검증 생략(CI·env 없는 로컬 빌드). 새 env 추가 시 이 파일만 고친다
import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  server: {
    PI_SESSION_SECRET: z
      .string()
      .min(32, 'PI_SESSION_SECRET는 최소 32자 이상이어야 합니다'),
    // Pi Developer Portal 앱 API 키(결제 approve/complete — Phase 2)
    PI_API_KEY: z.string().optional(),
    // Developer Portal 도메인 소유 검증 키 — /validation-key.txt가 그대로 서빙, 미설정 시 404
    PI_DOMAIN_VALIDATION_KEY: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    // 관리자 Pi 사용자명(쉼표 구분) — 로그인 시 role=ADMIN 승격(강등은 DB 수동)
    ADMIN_PI_USERNAMES: z.string().optional(),
    // 관리자 Pi uid(쉼표 구분) — 설정 시 username과 uid가 모두 일치해야 승격(sitemap 앱 기준 uid).
    // 운영 tier 에서 ADMIN_PI_USERNAMES 설정 시 필수(아래 createFinalSchema, KISA 2026-10-09 재점검)
    ADMIN_PI_UIDS: z.string().optional(),
    // 도메인 소유 확인 토큰 HMAC 키(32자 이상 권장, 세션 키와 분리). 미설정 시 PI_SESSION_SECRET 폴백(src/lib/api.ts verifyToken)
    SITEMAP_VERIFY_SECRET: z.string().min(32).optional(),
    // Vercel 주입 — 운영 tier 판정용(APP_TIER 미설정 시 production = 운영)
    VERCEL_ENV: z.string().optional(),
    // PostgREST 대상 스키마 — 비운영은 pi-nonprod 프로젝트의 sitemap_dev·sitemap_stg, 운영은 미설정(public)
    SUPABASE_SCHEMA: z.string().optional(),
    // 3-tier DB 라우팅(@pi/db) — 전부 optional. dev/staging tier 는 자기 자격증명 필수(운영 폴백 없음 → 미설정 시 503)
    APP_TIER: z.enum(['dev', 'staging', 'prod']).optional(),
    STAGING_DB_TARGET: z.enum(['staging', 'prod-ro']).optional(),
    DEV_SUPABASE_URL: z.string().url().optional(),
    DEV_SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    STAGING_SUPABASE_URL: z.string().url().optional(),
    STAGING_SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    PROD_RO_SUPABASE_URL: z.string().url().optional(),
    PROD_RO_SUPABASE_KEY: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_PI_SANDBOX: z.enum(['true', 'false']).optional(),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  },
  runtimeEnv: {
    PI_SESSION_SECRET: process.env.PI_SESSION_SECRET,
    PI_API_KEY: process.env.PI_API_KEY,
    PI_DOMAIN_VALIDATION_KEY: process.env.PI_DOMAIN_VALIDATION_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ADMIN_PI_USERNAMES: process.env.ADMIN_PI_USERNAMES,
    ADMIN_PI_UIDS: process.env.ADMIN_PI_UIDS,
    SITEMAP_VERIFY_SECRET: process.env.SITEMAP_VERIFY_SECRET,
    VERCEL_ENV: process.env.VERCEL_ENV,
    SUPABASE_SCHEMA: process.env.SUPABASE_SCHEMA,
    APP_TIER: process.env.APP_TIER,
    STAGING_DB_TARGET: process.env.STAGING_DB_TARGET,
    DEV_SUPABASE_URL: process.env.DEV_SUPABASE_URL,
    DEV_SUPABASE_SERVICE_ROLE_KEY: process.env.DEV_SUPABASE_SERVICE_ROLE_KEY,
    STAGING_SUPABASE_URL: process.env.STAGING_SUPABASE_URL,
    STAGING_SUPABASE_SERVICE_ROLE_KEY:
      process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
    PROD_RO_SUPABASE_URL: process.env.PROD_RO_SUPABASE_URL,
    PROD_RO_SUPABASE_KEY: process.env.PROD_RO_SUPABASE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_PI_SANDBOX: process.env.NEXT_PUBLIC_PI_SANDBOX,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  },
  // 운영 tier(@pi/db resolveDbTier 와 같은 우선순위 : APP_TIER > VERCEL_ENV)에서 관리자 username 만 있고 uid 가 없으면 빌드 실패.
  // 런타임 이중 방어 = @pi/db grantEnvAdmin(운영 tier + uid 미설정 → 승격 안 함)
  createFinalSchema: (shape, isServer) =>
    z.object(shape).superRefine((v, ctx) => {
      if (!isServer) return
      const prod =
        v.APP_TIER === 'prod' ||
        (!v.APP_TIER && v.VERCEL_ENV === 'production')
      if (prod && v.ADMIN_PI_USERNAMES && !v.ADMIN_PI_UIDS)
        ctx.addIssue({
          code: 'custom',
          path: ['ADMIN_PI_UIDS'],
          message: '운영 tier 에서 ADMIN_PI_USERNAMES 를 쓰려면 ADMIN_PI_UIDS 도 필수입니다',
        })
    }),
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
})
