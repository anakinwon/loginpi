// seminar.pi 환경변수 스키마(t3-env) — next.config.ts 가 import 해 빌드 시점 검증. 로그인 키는 sitemap.pi 와 같은 규칙(docs/LOGIN_PLAYBOOK.md §4).
// SKIP_ENV_VALIDATION=1 이면 검증 생략. 키 추가 시 .env.example 동시 수정
import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  server: {
    // M0 실험실(/lab/*) 운영 배포 허용 스위치 — '1' 일 때만 운영 빌드에서 열림(R-P6). 실기기 시험 끝나면 Vercel 에서 제거
    LAB_ENABLED: z.enum(['1']).optional(),
    PI_SESSION_SECRET: z
      .string()
      .min(32, 'PI_SESSION_SECRET는 최소 32자 이상이어야 합니다'),
    // Pi Developer Portal 앱 API 키(결제 approve/complete — 결제 단계에서 사용)
    PI_API_KEY: z.string().optional(),
    // Developer Portal 도메인 소유 검증 키 — /validation-key.txt가 그대로 서빙, 미설정 시 404
    PI_DOMAIN_VALIDATION_KEY: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    // 관리자 Pi 사용자명(쉼표 구분) — 로그인 시 role=ADMIN 승격(강등은 DB 수동)
    ADMIN_PI_USERNAMES: z.string().optional(),
    // 관리자 Pi uid(쉼표 구분) — 설정 시 username과 uid가 모두 일치해야 승격(seminar 앱 기준 uid).
    // 운영 tier 에서 ADMIN_PI_USERNAMES 설정 시 필수(아래 createFinalSchema, KISA 2026-10-09 재점검)
    ADMIN_PI_UIDS: z.string().optional(),
    // Vercel 주입 — 운영 tier 판정용(APP_TIER 미설정 시 production = 운영)
    VERCEL_ENV: z.string().optional(),
    // PostgREST 대상 스키마 — 비운영은 pi-nonprod 프로젝트의 seminar_dev·seminar_stg, 운영은 미설정(public)
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
    // Google 로그인(NextAuth, 일반 브라우저) — 셋 다 있어야 활성(src/auth.ts googleEnabled). 운영은 AUTH_URL 설정 금지(host 자동 감지)
    AUTH_SECRET: z.string().min(32).optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    // 미디어 엔진(Galápagos) 입장권 JWT HS256 서명 키 — 엔진 MEDIA_TOKEN_SECRET 과 같은 값(PRD_02 D-11). 미설정 = 입장권 발급 503
    MEDIA_TOKEN_SECRET: z.string().min(32).optional(),
    // 엔진 관리 API Bearer 키 — 엔진 MEDIA_ADMIN_SECRET 과 같은 값. 설정 = /api/speech/chunk 가 엔진에 무대 역할을 묻는다(D-1, 청중 음성 AI 호출 차단).
    //  미설정 = 무대 확인 없이 DB 청중 몫(1/2) 상한만(sql/010)
    MEDIA_ADMIN_SECRET: z.string().min(32).optional(),
    // TURN 단기 자격 증명(/api/media/turn, M2 ⑨) — 전부 서버 전용·선택. 1순위 Cloudflare Realtime TURN(둘 다 있어야 사용)
    CLOUDFLARE_TURN_TOKEN_ID: z.string().optional(),
    CLOUDFLARE_TURN_API_TOKEN: z.string().optional(),
    // 2순위 HMAC(coturn use-auth-secret) — 둘 다 있어야 사용. 둘 다 없으면 STUN 만
    TURN_HOST: z.string().optional(),
    TURN_SECRET: z.string().optional(),
    // 자격 증명 수명(초) — 기본 3600, 라우트가 60~86400 으로 제한
    TURN_CREDENTIAL_TTL: z.coerce.number().int().positive().optional(),
    // 외부 AI(음성→글·번역·요약·합성 음성, 계획 M-1) 서버 키 — 미설정 = AI 기능 503 + 화면 숨김(src/lib/gemini.ts)
    GEMINI_API_KEY: z.string().optional(),
    // Vercel cron 비밀값(Authorization: Bearer) — 대면 노트 원본 음성 보관 정리(api/cron/note-audio). 미설정 = cron 503(종료 때 정리만)
    CRON_SECRET: z.string().min(16).optional(),
    // 세미나(또는 대면 노트) 1건당 음성 처리 상한(분) — 기본 120(src/lib/speech-rules.ts), 비용 폭주 차단(A-5)
    SPEECH_MAX_MIN: z.coerce.number().int().min(1).max(1440).optional(),
    // 사용자 1인(세미나 × 사용자) 번역·합성 누적 글자 상한 — 기본 10만·2만(src/lib/translate-rules.ts USR_AI_LIMIT), 세미나 상한 이하(감사 High 1)
    SPEECH_USR_TRANS_CHR: z.coerce.number().int().min(1).max(1_000_000).optional(),
    SPEECH_USR_TTS_CHR: z.coerce.number().int().min(1).max(200_000).optional(),
  },
  client: {
    // 미디어 엔진 시그널링 WebSocket 주소(예 ws://localhost:7880/signal, 운영 wss://). 미설정 = 화상 기능 숨김
    NEXT_PUBLIC_MEDIA_WS_URL: z
      .string()
      .regex(/^wss?:\/\//, 'ws:// 또는 wss:// 주소여야 합니다')
      .optional(),
    // M0 기기 2대 연결 시그널링 = Supabase Realtime broadcast(테이블 미사용). 비운영 pi-nonprod 프로젝트 값
    NEXT_PUBLIC_LAB_SUPABASE_URL: z.url().optional(),
    NEXT_PUBLIC_LAB_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_PI_SANDBOX: z.enum(['true', 'false']).optional(),
    // Pi Sign-In(OAuth) Client ID — 일반 브라우저 Pi 로그인. 미설정이면 SDK 로그인만(cafe.pi 동일 규칙)
    NEXT_PUBLIC_PI_OAUTH_CLIENT_ID: z.string().optional(),
    // Pi Browser 가 이 앱을 여는 Portal 포워딩 도메인(<app>.pinet.com, 환경별 다름) — 인증 API Origin 허용(@pi/guard withAuthGuard ③)
    NEXT_PUBLIC_PI_APP_DOMAIN: z.string().optional(),
    // '1' 이면 클라이언트에 Google 로그인 버튼 노출(서버 env 3종과 함께 설정)
    NEXT_PUBLIC_GOOGLE_LOGIN: z.enum(['1']).optional(),
    // 요금제 화면 원화 참고 환산 표시 — '1'(기본) 보임, '0' 숨김(결제는 언제나 Pi, 원화는 표시용)
    NEXT_PUBLIC_PLAN_KRW_REF: z.enum(['0', '1']).optional(),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  },
  runtimeEnv: {
    LAB_ENABLED: process.env.LAB_ENABLED,
    NEXT_PUBLIC_LAB_SUPABASE_URL: process.env.NEXT_PUBLIC_LAB_SUPABASE_URL,
    NEXT_PUBLIC_LAB_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_LAB_SUPABASE_PUBLISHABLE_KEY,
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
    MEDIA_TOKEN_SECRET: process.env.MEDIA_TOKEN_SECRET,
    MEDIA_ADMIN_SECRET: process.env.MEDIA_ADMIN_SECRET,
    CLOUDFLARE_TURN_TOKEN_ID: process.env.CLOUDFLARE_TURN_TOKEN_ID,
    CLOUDFLARE_TURN_API_TOKEN: process.env.CLOUDFLARE_TURN_API_TOKEN,
    TURN_HOST: process.env.TURN_HOST,
    TURN_SECRET: process.env.TURN_SECRET,
    TURN_CREDENTIAL_TTL: process.env.TURN_CREDENTIAL_TTL,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    SPEECH_MAX_MIN: process.env.SPEECH_MAX_MIN,
    SPEECH_USR_TRANS_CHR: process.env.SPEECH_USR_TRANS_CHR,
    SPEECH_USR_TTS_CHR: process.env.SPEECH_USR_TTS_CHR,
    NEXT_PUBLIC_MEDIA_WS_URL: process.env.NEXT_PUBLIC_MEDIA_WS_URL,
    NEXT_PUBLIC_GOOGLE_LOGIN: process.env.NEXT_PUBLIC_GOOGLE_LOGIN,
    NEXT_PUBLIC_PLAN_KRW_REF: process.env.NEXT_PUBLIC_PLAN_KRW_REF,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_PI_SANDBOX: process.env.NEXT_PUBLIC_PI_SANDBOX,
    NEXT_PUBLIC_PI_OAUTH_CLIENT_ID: process.env.NEXT_PUBLIC_PI_OAUTH_CLIENT_ID,
    NEXT_PUBLIC_PI_APP_DOMAIN: process.env.NEXT_PUBLIC_PI_APP_DOMAIN,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  },
  // 운영 tier(@pi/db resolveDbTier 와 같은 우선순위 : APP_TIER > VERCEL_ENV)에서 관리자 username 만 있고 uid 가 없으면 빌드 실패.
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
