// schema.pi 환경변수 스키마(zod) — next.config.ts 가 import 해 빌드·기동 시점 검증
// 값은 .env.local(커밋 금지)에 둔다. Supabase·Pi 키는 0단계 연동 시 필수로 전환 [확인중 : 전용 Supabase 생성]
import { z } from 'zod'

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3002'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  PI_API_KEY: z.string().optional(),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('[env] 환경변수 오류', parsed.error.issues)
  throw new Error('Invalid environment variables')
}

export const env = parsed.data
