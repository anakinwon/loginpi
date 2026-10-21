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
  // Google 로그인(NextAuth, 일반 브라우저) — 셋 다 있어야 활성(src/auth.ts googleEnabled). 운영은 AUTH_URL 설정 금지(host 자동 감지)
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET는 최소 32자 이상이어야 합니다').optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Google 버튼 노출 플래그(클라이언트 인라인) — 서버 3종이 없으면 버튼만 보이고 404 가 나므로 함께 설정
  NEXT_PUBLIC_GOOGLE_LOGIN: z.enum(['1']).optional(),
  // 개념 모델 AI 추천(프로젝트명·설명, src/lib/modelpi/project-ai.ts) — 없으면 업종 템플릿 문장으로 대체(외부 전송 없음)
  ANTHROPIC_API_KEY: z.string().optional(),
  // 모니터링 AI 원인 분석 — 설정에 등록한 제공사별 키(sql/070 mon_ai_mdl, 키는 DB 에 저장하지 않음). 없으면 그 제공사 모델은 분석 불가(503)
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  // 모니터링 AI 수정안 PR(src/lib/mon-fix.ts) — 저장소 Contents·Pull requests 쓰기 토큰. 없으면 'PR 로 해결' 503
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_REPO: z.string().optional(),
  GITHUB_BASE: z.string().optional(),
  // DDL 직접 실행(2026-10-18) — 접속 비밀번호 암호화 키(32바이트 base64, openssl rand -base64 32). 없으면 접속 저장·시험·승인·실행 모두 꺼짐(503)
  DB_PROFILE_KEY: z.string().optional(),
  // 서버 직접 실행(PostgreSQL·Oracle) 켜기 = 1. 끄면 로컬 에이전트 실행만(긴급 차단 스위치)
  DDL_DIRECT_ENABLED: z.enum(['0', '1']).optional(),
  // 개발 전용 : 사설·루프백 주소 접속 허용(로컬 PostgreSQL 시험). production 에서는 무시
  DB_CONN_ALLOW_PRIVATE: z.enum(['0', '1']).optional(),
  // 모니터링 주기 수집(GET /api/mon/collect, Vercel Cron 이 Authorization: Bearer 로 보냄) — 없으면 주기 수집 꺼짐(화면 열 때만 수집)
  CRON_SECRET: z.string().min(16).optional(),
}).superRefine((v, ctx) => {
  const g = [v.GOOGLE_CLIENT_ID, v.GOOGLE_CLIENT_SECRET, v.AUTH_SECRET]
  if (g.some(Boolean) && !g.every(Boolean))
    ctx.addIssue({ code: 'custom', path: ['GOOGLE_CLIENT_ID'], message: 'Google 로그인은 GOOGLE_CLIENT_ID·GOOGLE_CLIENT_SECRET·AUTH_SECRET 세 값을 함께 설정해야 합니다' })
  if (v.NEXT_PUBLIC_GOOGLE_LOGIN === '1' && !g.every(Boolean))
    ctx.addIssue({ code: 'custom', path: ['NEXT_PUBLIC_GOOGLE_LOGIN'], message: 'NEXT_PUBLIC_GOOGLE_LOGIN=1 은 Google 서버 설정 3종이 있을 때만' })
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('[env] 환경변수 오류', parsed.error.issues)
  throw new Error('Invalid environment variables')
}

export const env = parsed.data
