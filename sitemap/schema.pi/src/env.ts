// schema.pi 환경변수 스키마(zod) — next.config.ts 가 import 해 빌드·기동 시점 검증. 값은 .env.local(커밋 금지)·Vercel env 에만
import { z } from 'zod'

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3002'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  PI_API_KEY: z.string().optional(),
  // Pi 로그인(@pi/auth) — HMAC 세션 서명 키. 바꾸면 기존 세션 전부 무효
  PI_SESSION_SECRET: z.string().min(32, 'PI_SESSION_SECRET는 최소 32자 이상이어야 합니다'),
  // Pi SDK sandbox — 운영 false, Testnet 앱 true. localhost 는 자동 sandbox(@pi/auth provider)
  NEXT_PUBLIC_PI_SANDBOX: z.enum(['true', 'false']).optional(),
  // Pi Browser 가 앱을 여는 Portal 포워딩 도메인(<app>.pinet.com) — 로그인 POST Origin 허용(@pi/guard withAuthGuard)
  NEXT_PUBLIC_PI_APP_DOMAIN: z.string().optional(),
  // 로그인 시 sys_user.role_cd=ADMIN 으로 승격할 Pi 사용자명(쉼표 구분)
  ADMIN_PI_USERNAMES: z.string().optional(),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('[env] 환경변수 오류', parsed.error.issues)
  throw new Error('Invalid environment variables')
}

export const env = parsed.data
