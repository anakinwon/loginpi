import { NextRequest, NextResponse } from 'next/server'
import { cookies, headers } from 'next/headers'
import { auth } from '@/auth'

// ⚠️ 임시 진단 엔드포인트 — 운영 일반브라우저 세션 미인식(auth() null) 원인 규명용.
//    진단 대상이 운영이라 production을 막을 수 없으므로 쿼리 토큰(?k=)으로 게이트한다.
//    토큰 불일치 시 404 → 정보 노출 0. 민감값(secret)은 존재여부(boolean)만 반환.
//    ⛔ 원인 확정 후 이 파일을 즉시 삭제할 것(일회성).
export const dynamic = 'force-dynamic'

// 일회성 진단 토큰(랜덤). 진단 후 파일과 함께 폐기되므로 하드코딩 허용.
const DIAG_KEY = 'dbg_9f3a71c2e4b840d6a1f05c8e2d7b6a94'

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('k') !== DIAG_KEY) {
    return new NextResponse(null, { status: 404 })
  }
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
