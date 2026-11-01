// dbms.pi 환경변수 스키마(t3-env) — next.config.ts 가 import 해 빌드 시점 검증. 로그인 키는 sitemap.pi 와 같은 규칙(docs/LOGIN_PLAYBOOK.md §4).
// SKIP_ENV_VALIDATION=1 이면 검증 생략. 키 추가 시 dbms.pi .env.example 동시 수정(DBMS_*_DATABASE_URL 은 마이그레이션 전용이라 여기 없음)
import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  server: {
    PI_SESSION_SECRET: z
      .string()
      .min(32, 'PI_SESSION_SECRET는 최소 32자 이상이어야 합니다'),
    // dbms.pi Pi Developer Portal 앱 API 키 — 결제(Phase 2)용, Phase 1 미사용
    PI_API_KEY: z.string().optional(),
    // dbms.pi Developer Portal 도메인 소유 검증 키 — /validation-key.txt 가 그대로 서빙, 미설정 시 404
    PI_DOMAIN_VALIDATION_KEY: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    // dbms.pi 관리자 Pi 사용자명(쉼표 구분) — 로그인 시 role=ADMIN 승격(강등은 DB 수동)
    ADMIN_PI_USERNAMES: z.string().optional(),
    // dbms.pi 관리자 Pi uid(쉼표 구분) — 설정 시 username과 uid가 모두 일치해야 승격(dbms.pi 앱 기준 uid).
    // 운영 tier 에서 ADMIN_PI_USERNAMES 설정 시 필수(아래 createFinalSchema)
    ADMIN_PI_UIDS: z.string().optional(),
    // Vercel 주입 — dbms.pi 운영 tier 판정용(APP_TIER 미설정 시 production = 운영)
    VERCEL_ENV: z.string().optional(),
    // dbms.pi PostgREST 대상 스키마 — 비운영은 pi-nonprod 프로젝트의 dbms_dev·dbms_stg, 운영은 미설정(public)
    SUPABASE_SCHEMA: z.string().optional(),
    // dbms.pi 3-tier DB 라우팅(@pi/db) — 전부 optional. dev/staging tier 는 자기 자격증명 필수(운영 폴백 없음 → 미설정 시 503)
    APP_TIER: z.enum(['dev', 'staging', 'prod']).optional(),
    STAGING_DB_TARGET: z.enum(['staging', 'prod-ro']).optional(),
    DEV_SUPABASE_URL: z.string().url().optional(),
    DEV_SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    STAGING_SUPABASE_URL: z.string().url().optional(),
    STAGING_SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    PROD_RO_SUPABASE_URL: z.string().url().optional(),
    PROD_RO_SUPABASE_KEY: z.string().optional(),
    // dbms.pi Google 로그인(NextAuth, 일반 브라우저) — 셋 다 있어야 활성(src/auth.ts googleEnabled). 운영은 AUTH_URL 설정 금지(host 자동 감지)
    AUTH_SECRET: z.string().min(32).optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    // dbms.pi 크론 Bearer 비밀값 — 크론 라우트 미구현(Phase 1 미사용)
    CRON_SECRET: z.string().min(16).optional(),
    // dbms.pi 애플리케이션 모니터링 → schema.pi 수집 API — 전달 라우트 미구현(TODO 7단계, Phase 1 미사용)
    MON_INGEST_URL: z.string().url().optional(),
    MON_INGEST_KEY: z.string().min(32).optional(),
  },
  client: {
    // dbms.pi 공개 URL — Origin 검사·메타. 미설정이면 src/lib/site-url.ts 가 http://localhost:3004 로 폴백
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    NEXT_PUBLIC_PI_SANDBOX: z.enum(['true', 'false']).optional(),
    // dbms.pi Pi Sign-In(OAuth) Client ID — 일반 브라우저 Pi 로그인. 미설정이면 SDK 로그인만(cafe.pi 동일 규칙)
    NEXT_PUBLIC_PI_OAUTH_CLIENT_ID: z.string().optional(),
    // Pi Browser 가 dbms.pi 를 여는 Portal 포워딩 도메인(<app>.pinet.com, 환경별 다름) — 인증 API Origin 허용(@pi/guard withAuthGuard ③)
    NEXT_PUBLIC_PI_APP_DOMAIN: z.string().optional(),
    // '1' 이면 dbms.pi 클라이언트에 Google 로그인 버튼 노출(서버 env 3종과 함께 설정)
    NEXT_PUBLIC_GOOGLE_LOGIN: z.enum(['1']).optional(),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
    // dbms.pi 상단 언어 콤보 Pi 환산·π 시세칩 — 미설정·'true' = 표시(기본), 'false' = 숨김(다국어 표준 4.6)
    NEXT_PUBLIC_FEATURE_PI_PRICE: z.enum(['true', 'false']).optional(),
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
    AUTH_SECRET: process.env.AUTH_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
    MON_INGEST_URL: process.env.MON_INGEST_URL,
    MON_INGEST_KEY: process.env.MON_INGEST_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_PI_SANDBOX: process.env.NEXT_PUBLIC_PI_SANDBOX,
    NEXT_PUBLIC_PI_OAUTH_CLIENT_ID: process.env.NEXT_PUBLIC_PI_OAUTH_CLIENT_ID,
    NEXT_PUBLIC_PI_APP_DOMAIN: process.env.NEXT_PUBLIC_PI_APP_DOMAIN,
    NEXT_PUBLIC_GOOGLE_LOGIN: process.env.NEXT_PUBLIC_GOOGLE_LOGIN,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_FEATURE_PI_PRICE: process.env.NEXT_PUBLIC_FEATURE_PI_PRICE,
  },
  // dbms.pi 운영 tier(@pi/db resolveDbTier 와 같은 우선순위 : APP_TIER > VERCEL_ENV)에서 관리자 username 만 있고 uid 가 없으면 빌드 실패.
  // 런타임 이중 방어 = @pi/db grantEnvAdmin(운영 tier + uid 미설정 → 승격 안 함)
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
      // Google 로그인은 셋 다 — 일부만 있으면 버튼은 뜨는데 콜백이 실패하는 반쪽 상태가 된다
      const g = [v.GOOGLE_CLIENT_ID, v.GOOGLE_CLIENT_SECRET, v.AUTH_SECRET]
      if (g.some(Boolean) && !g.every(Boolean))
        ctx.addIssue({
          code: 'custom',
          path: ['GOOGLE_CLIENT_ID'],
          message:
            'Google 로그인은 GOOGLE_CLIENT_ID·GOOGLE_CLIENT_SECRET·AUTH_SECRET 세 값을 함께 설정해야 합니다',
        })
    }),
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
})
