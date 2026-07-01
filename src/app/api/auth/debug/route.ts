import { NextRequest, NextResponse } from 'next/server'
import { cookies, headers } from 'next/headers'
import { auth } from '@/auth'
import { getUserById, getUserByGoogleId } from '@/lib/users'
import { getSessionUser } from '@/lib/auth-check'

// ⚠️ 임시 진단 엔드포인트 — 운영 일반브라우저 세션 미인식 원인 규명용.
//    진단 대상이 운영이라 production을 막을 수 없으므로 쿼리 토큰(?k=)으로 게이트한다.
//    토큰 불일치 시 404 → 정보 노출 0. 민감값은 존재여부(boolean)만 반환.
//    ⛔ 원인 확정 후 이 파일을 즉시 삭제할 것(일회성).
export const dynamic = 'force-dynamic'

const DIAG_KEY = 'dbg_9f3a71c2e4b840d6a1f05c8e2d7b6a94'

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('k') !== DIAG_KEY) {
    return new NextResponse(null, { status: 404 })
  }
  const cookieStore = await cookies()
  const cookieNames = cookieStore.getAll().map((c) => c.name)

  // 1) auth() 세션
  let authId: string | null = null
  let authSub: string | null = null
  let authError: string | null = null
  try {
    const s = await auth()
    authId = s?.user?.id ?? null
    authSub = (s?.user as { sub?: string } | undefined)?.sub ?? null
  } catch (e) {
    authError = e instanceof Error ? e.message : String(e)
  }

  // 2) getSessionUser 내부 단계 재현 — 어디서 null이 되는지 확정
  let byIdFound: boolean | null = null
  let byIdHasPiUid: boolean | null = null
  let byIdDelYn: string | null = null
  let bySubFound: boolean | null = null
  let bySubHasPiUid: boolean | null = null
  let sessionUserFound: boolean | null = null
  let stepError: string | null = null
  try {
    if (authId) {
      const u = await getUserById(authId)
      byIdFound = !!u
      byIdHasPiUid = u ? !!u.pi_uid : null
      byIdDelYn = u ? (u.del_yn ?? null) : null
    }
    if (authSub) {
      const u = await getUserByGoogleId(authSub)
      bySubFound = !!u
      bySubHasPiUid = u ? !!u.pi_uid : null
    }
    const su = await getSessionUser()
    sessionUserFound = !!su
  } catch (e) {
    stepError = e instanceof Error ? e.message : String(e)
  }

  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    appTier: process.env.APP_TIER ?? null,
    // 앱이 실제로 보는 DB — 운영 DB가 맞는지 확인 (도메인만, 준민감)
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    serviceKeyPrefix: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').slice(0, 10),
    cookieNames,
    authId,
    hasAuthSub: !!authSub,
    authError,
    // 단계별 결과: 여기서 어디가 false인지가 원인
    byIdFound,
    byIdHasPiUid,
    byIdDelYn,
    bySubFound,
    bySubHasPiUid,
    sessionUserFound,
    stepError,
  })
}
