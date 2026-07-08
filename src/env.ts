import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  server: {
    PI_SESSION_SECRET: z
      .string()
      .min(32, 'PI_SESSION_SECRET는 최소 32자 이상이어야 합니다'),
    AUTH_SECRET: z
      .string()
      .min(32, 'AUTH_SECRET은 최소 32자 이상이어야 합니다'),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    PI_API_KEY: z.string().optional(),
    // A2U(App→User) 환불·정산 송금용 앱 지갑 시드 (Pi Developer Portal, 'S'로 시작).
    // 미설정 시 환불은 PENDING 장부 기록만 하고 실송금은 스킵 (서버 전용 비밀, 절대 클라이언트 노출 금지)
    PI_WALLET_PRIVATE_SEED: z.string().optional(),
    // 앱 지갑 주소 선언('G'로 시작, 선택) — a2u-status 진단이 시드 도출 지갑과 대조.
    // ⛔ 코드에 지갑 주소 하드코딩 금지 — 기대값은 반드시 이 env로만 선언 (2026-07-02)
    PI_WALLET_AGGRESS: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    // ── 3-tier DB 라우팅(src/lib/db-env.ts) — 전부 optional, 미설정 시 현행 운영 DB 폴백(하위호환) ──
    // tier 자동판정(VERCEL_ENV)을 덮어쓸 명시값. 보통 미설정.
    APP_TIER: z.enum(['dev', 'staging', 'prod']).optional(),
    // 스테이징 DB 스위치: 'staging'(자체 DB·RW, 기본) | 'prod-ro'(운영DB 읽기 전용)
    STAGING_DB_TARGET: z.enum(['staging', 'prod-ro']).optional(),
    DEV_SUPABASE_URL: z.string().url().optional(),
    DEV_SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    STAGING_SUPABASE_URL: z.string().url().optional(),
    STAGING_SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    // 운영DB 읽기 전용 접근용 — read-only 롤/Read Replica 자격증명(전권 service_role 금지)
    PROD_RO_SUPABASE_URL: z.string().url().optional(),
    PROD_RO_SUPABASE_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    GEMINI_API_KEY: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    RESEND_FROM_EMAIL: z.string().optional(),
    // cron 인증 비밀. 미설정 시 cron 핸들러가 전량 401 → 재평가 안전망이 조용히 죽는다.
    // Vercel 프로덕션 빌드(VERCEL_ENV='production')에서만 필수로 강제해 조용한 실패를 차단한다.
    // 로컬·프리뷰 빌드는 VERCEL_ENV가 다르므로 optional 유지(개발 편의).
    CRON_SECRET:
      process.env.VERCEL_ENV === 'production'
        ? z.string().min(1, 'CRON_SECRET은 프로덕션에서 필수입니다 (cron 인증)')
        : z.string().optional(),
    // Telegram 봇 토큰(@BotFather 발급) — 판매자 주문 알림 발송용. 서버 전용.
    // 미설정 시 발송 비활성(Outbox 행은 sent_yn='N'로 보존 → 토큰 설정 후 디스패처가 재발송).
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    // 봇 username(@ 제외) — 연동 딥링크 t.me/<username>?start=... 생성용.
    TELEGRAM_BOT_USERNAME: z.string().optional(),
    // webhook 검증 시크릿 — setWebhook 시 등록, 요청 헤더와 대조해 위조 차단.
    TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
    // 운영 알림 수신 텔레그램 chat id(선택) — Bean 항등식 불일치 등 CRITICAL 경보 발송 대상.
    ADMIN_TELEGRAM_CHAT_ID: z.string().optional(),
    TURN_HOST: z.string().optional(),
    TURN_SECRET: z.string().optional(),
    TURN_CREDENTIAL_TTL: z.coerce.number().optional(),
    // Cloudflare Realtime TURN (운영 권장 — 무료 1TB/월). 둘 다 설정 시 최우선 사용.
    // Cloudflare 대시보드 → Realtime → TURN 앱 생성 시 발급. 서버 전용(클라이언트 노출 금지).
    CLOUDFLARE_TURN_TOKEN_ID: z.string().optional(),
    CLOUDFLARE_TURN_API_TOKEN: z.string().optional(),
    GOOGLE_MAPS_API_KEY: z.string().optional(),
    // PyVoice v3.0 권한 슬롯 (R7 — 향후 확대 가능, 기본 자동 2/멤버 4)
    VOICE_AUTO_SLOTS: z.coerce.number().int().positive().optional(),
    VOICE_MAX_MEMBER_SLOTS: z.coerce.number().int().positive().optional(),
    // ── 운영 도구(/admin/deploy·/admin/db-switch) — 전부 optional, 미설정 시 기능 '미구성' 비활성 ──
    // 운영 승격(master→production fast-forward)용 GitHub 토큰(repo contents:write). 서버 전용.
    GITHUB_DEPLOY_TOKEN: z.string().optional(),
    GITHUB_REPO: z.string().optional(), // 'owner/repo' (기본 anakinwon/loginpi)
    // Stage 재배포 트리거(Vercel Deploy Hook URL — loginpi/master). 토큰 불필요(URL 자체가 시크릿)
    VERCEL_STAGING_DEPLOY_HOOK: z.string().url().optional(),
    // 운영 재배포 트리거(Vercel Deploy Hook URL — cafepi/production, 승격 후 보조). 선택
    VERCEL_PROD_DEPLOY_HOOK: z.string().url().optional(),
    // Staging DB 스위치(STAGING_DB_TARGET env 변경)용 Vercel API 토큰 + 대상 프로젝트
    VERCEL_API_TOKEN: z.string().optional(),
    VERCEL_TEAM_ID: z.string().optional(),
    VERCEL_STAGING_PROJECT_ID: z.string().optional(), // loginpi 프로젝트 id
    VERCEL_PROD_PROJECT_ID: z.string().optional(), // cafepi 프로젝트 id(운영 배포 상태 조회)
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_PI_SANDBOX: z.enum(['true', 'false']).optional(),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().optional(),
    // Pi 시세 칩(법정화폐 환산) 노출 여부 — Pi 정책(가치평가 언급 최소화) 대응, 기본 비활성
    NEXT_PUBLIC_FEATURE_PI_PRICE: z.enum(['true', 'false']).optional(),
    // Pi Browser 딥링크(pi://)용 Pi 정식 도메인 — ⚠️ staging≠운영 환경별 다름.
    //   staging=apppilogintestbd3106.pinet.com / 운영=운영 pinet 도메인. 미설정 시 현재 도메인 폴백.
    NEXT_PUBLIC_PI_APP_DOMAIN: z.string().optional(),
    // Pi Sign-In(OAuth implicit) 클라이언트 ID — 일반 브라우저 'Pi로 로그인' 버튼 활성 조건
    NEXT_PUBLIC_PI_OAUTH_CLIENT_ID: z.string().optional(),
  },
  runtimeEnv: {
    PI_SESSION_SECRET: process.env.PI_SESSION_SECRET,
    AUTH_SECRET: process.env.AUTH_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    PI_API_KEY: process.env.PI_API_KEY,
    PI_WALLET_PRIVATE_SEED: process.env.PI_WALLET_PRIVATE_SEED,
    PI_WALLET_AGGRESS: process.env.PI_WALLET_AGGRESS,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    APP_TIER: process.env.APP_TIER,
    STAGING_DB_TARGET: process.env.STAGING_DB_TARGET,
    DEV_SUPABASE_URL: process.env.DEV_SUPABASE_URL,
    DEV_SUPABASE_SERVICE_ROLE_KEY: process.env.DEV_SUPABASE_SERVICE_ROLE_KEY,
    STAGING_SUPABASE_URL: process.env.STAGING_SUPABASE_URL,
    STAGING_SUPABASE_SERVICE_ROLE_KEY:
      process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
    PROD_RO_SUPABASE_URL: process.env.PROD_RO_SUPABASE_URL,
    PROD_RO_SUPABASE_KEY: process.env.PROD_RO_SUPABASE_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    CRON_SECRET: process.env.CRON_SECRET,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
    ADMIN_TELEGRAM_CHAT_ID: process.env.ADMIN_TELEGRAM_CHAT_ID,
    TURN_HOST: process.env.TURN_HOST,
    TURN_SECRET: process.env.TURN_SECRET,
    TURN_CREDENTIAL_TTL: process.env.TURN_CREDENTIAL_TTL,
    CLOUDFLARE_TURN_TOKEN_ID: process.env.CLOUDFLARE_TURN_TOKEN_ID,
    CLOUDFLARE_TURN_API_TOKEN: process.env.CLOUDFLARE_TURN_API_TOKEN,
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
    VOICE_AUTO_SLOTS: process.env.VOICE_AUTO_SLOTS,
    VOICE_MAX_MEMBER_SLOTS: process.env.VOICE_MAX_MEMBER_SLOTS,
    GITHUB_DEPLOY_TOKEN: process.env.GITHUB_DEPLOY_TOKEN,
    GITHUB_REPO: process.env.GITHUB_REPO,
    VERCEL_STAGING_DEPLOY_HOOK: process.env.VERCEL_STAGING_DEPLOY_HOOK,
    VERCEL_PROD_DEPLOY_HOOK: process.env.VERCEL_PROD_DEPLOY_HOOK,
    VERCEL_API_TOKEN: process.env.VERCEL_API_TOKEN,
    VERCEL_TEAM_ID: process.env.VERCEL_TEAM_ID,
    VERCEL_STAGING_PROJECT_ID: process.env.VERCEL_STAGING_PROJECT_ID,
    VERCEL_PROD_PROJECT_ID: process.env.VERCEL_PROD_PROJECT_ID,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_PI_OAUTH_CLIENT_ID: process.env.NEXT_PUBLIC_PI_OAUTH_CLIENT_ID,
    NEXT_PUBLIC_PI_SANDBOX: process.env.NEXT_PUBLIC_PI_SANDBOX,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    NEXT_PUBLIC_FEATURE_PI_PRICE: process.env.NEXT_PUBLIC_FEATURE_PI_PRICE,
    NEXT_PUBLIC_PI_APP_DOMAIN: process.env.NEXT_PUBLIC_PI_APP_DOMAIN,
  },
  emptyStringAsUndefined: true,
})
