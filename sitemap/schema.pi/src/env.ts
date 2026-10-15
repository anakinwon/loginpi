// schema.pi 환경변수 스키마(t3-env) — next.config.ts가 import해 빌드 시점 검증.
// SKIP_ENV_VALIDATION=1이면 검증 생략(CI·env 없는 로컬 빌드). 새 env 추가 시 이 파일만 고친다. sitemap.pi 에서 사이트 전용 항목(검증 토큰·샘플·크론·Google)을 뺀 공통 골격
import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  server: {
    PI_SESSION_SECRET: z
      .string()
      .min(32, 'PI_SESSION_SECRET는 최소 32자 이상이어야 합니다'),
    // Pi Developer Portal 앱 API 키(결제 approve/complete)
    PI_API_KEY: z.string().optional(),
    // Developer Portal 도메인 소유 검증 키 — /validation-key.txt가 그대로 서빙, 미설정 시 앱 루트 파일 폴백
    PI_DOMAIN_VALIDATION_KEY: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    // 관리자 Pi 사용자명(쉼표 구분) — 로그인 시 role=ADMIN 승격(강등은 DB 수동)
    ADMIN_PI_USERNAMES: z.string().optional(),
    // 관리자 Pi uid(쉼표 구분) — 운영 tier 에서 ADMIN_PI_USERNAMES 설정 시 필수(아래 createFinalSchema)
    ADMIN_PI_UIDS: z.string().optional(),
    // Vercel 주입 — 운영 tier 판정용(APP_TIER 미설정 시 production = 운영)
    VERCEL_ENV: z.string().optional(),
    // PostgREST 대상 스키마 — 비운영은 pi-nonprod 프로젝트의 schema_dev·schema_stg, 운영은 미설정(public)
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
    // Pi Sign-In(OAuth) Client ID — 일반 브라우저 Pi 로그인. 미설정이면 SDK 로그인만
    NEXT_PUBLIC_PI_OAUTH_CLIENT_ID: z.string().optional(),
    // Pi Browser 가 이 앱을 여는 Portal 포워딩 도메인(<app>.pinet.com) — 인증 API Origin 허용(@pi/guard)
    NEXT_PUBLIC_PI_APP_DOMAIN: z.string().optional(),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  },
  runtimeEnv: {
    PI_SESSION_SECRET: process.env.PI_SESSION_SECRET,
    PI_API_KEY: process.env.PI_API_KEY,
    PI_DOMAIN_VALIDATION_KEY: process.env.PI_DOMAIN_VALIDATION_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ADMIN_PI_USERNAMES: process.env.ADMIN_PI_USERNAMES,
    ADMIN_PI_UIDS: process.env.ADMIN_PI_UIDS,
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
    NEXT_PUBLIC_PI_OAUTH_CLIENT_ID: process.env.NEXT_PUBLIC_PI_OAUTH_CLIENT_ID,
    NEXT_PUBLIC_PI_APP_DOMAIN: process.env.NEXT_PUBLIC_PI_APP_DOMAIN,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  },
  // 운영 tier(APP_TIER > VERCEL_ENV)에서 관리자 username 만 있고 uid 가 없으면 빌드 실패(sitemap.pi 동일 규칙)
  createFinalSchema: (shape, isServer) =>
    z.object(shape).superRefine((v, ctx) => {
      if (!isServer) return
      const prod =
        v.APP_TIER === 'prod' || (!v.APP_TIER && v.VERCEL_ENV === 'production')
      if (prod && v.ADMIN_PI_USERNAMES && !v.ADMIN_PI_UIDS)
        ctx.addIssue({
          code: 'custom',
          path: ['ADMIN_PI_UIDS'],
          message:
            '운영 tier 에서 ADMIN_PI_USERNAMES 를 쓰려면 ADMIN_PI_UIDS 도 필수입니다',
        })
    }),
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
})
