import { NextResponse } from 'next/server'
import { cookies, headers } from 'next/headers'
import { auth } from '@/auth'

// ⚠️ 임시 진단 엔드포인트 — 운영 일반브라우저 세션 미인식(auth() null) 원인 규명용.
//    민감값(secret)은 존재여부(boolean)만 노출하고 값은 반환하지 않는다.
//    원인 확정 후 즉시 삭제할 것.
export const dynamic = 'force-dynamic'

export async function GET() {
  const cookieStore = await cookies()
  const cookieNames = cookieStore.getAll().map((c) => c.name)
  const h = await headers()

  let authResult: {
    hasUser: boolean
    id: string | null
    hasSub: boolean
  } | null = null
  let authError: string | null = null
  try {
    const s = await auth()
    authResult = s
      ? {
          hasUser: !!s.user,
          id: s.user?.id ?? null,
          hasSub: !!(s.user as { sub?: string } | undefined)?.sub,
        }
      : null
  } catch (e) {
    authError = e instanceof Error ? e.message : String(e)
  }

  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    host: h.get('host'),
    xForwardedHost: h.get('x-forwarded-host'),
    xForwardedProto: h.get('x-forwarded-proto'),
    cookieNames,
    env: {
      AUTH_SECRET: !!process.env.AUTH_SECRET,
      NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
      AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST ?? null,
      AUTH_URL: process.env.AUTH_URL ?? null,
      NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? null,
    },
    authResult,
    authError,
  })
}
