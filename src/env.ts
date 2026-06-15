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
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
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
    TURN_HOST: z.string().optional(),
    TURN_SECRET: z.string().optional(),
    TURN_CREDENTIAL_TTL: z.coerce.number().optional(),
    GOOGLE_MAPS_API_KEY: z.string().optional(),
    // PiVoice v3.0 권한 슬롯 (R7 — 향후 확대 가능, 기본 자동 2/멤버 4)
    VOICE_AUTO_SLOTS: z.coerce.number().int().positive().optional(),
    VOICE_MAX_MEMBER_SLOTS: z.coerce.number().int().positive().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_PI_SANDBOX: z.enum(['true', 'false']).optional(),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().optional(),
  },
  runtimeEnv: {
    PI_SESSION_SECRET: process.env.PI_SESSION_SECRET,
    AUTH_SECRET: process.env.AUTH_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    PI_API_KEY: process.env.PI_API_KEY,
    PI_WALLET_PRIVATE_SEED: process.env.PI_WALLET_PRIVATE_SEED,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    CRON_SECRET: process.env.CRON_SECRET,
    TURN_HOST: process.env.TURN_HOST,
    TURN_SECRET: process.env.TURN_SECRET,
    TURN_CREDENTIAL_TTL: process.env.TURN_CREDENTIAL_TTL,
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
    VOICE_AUTO_SLOTS: process.env.VOICE_AUTO_SLOTS,
    VOICE_MAX_MEMBER_SLOTS: process.env.VOICE_MAX_MEMBER_SLOTS,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_PI_SANDBOX: process.env.NEXT_PUBLIC_PI_SANDBOX,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  },
  emptyStringAsUndefined: true,
})
