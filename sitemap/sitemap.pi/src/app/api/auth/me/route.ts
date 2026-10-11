// 현재 로그인 사용자 — Pi 세션 OR Google 연동 세션(통합 getSessionUser). 클라이언트 통합 게이트(useAppUser)용.
// 미로그인은 200 {user:null}(401 아님 — 세션 폴링이 콘솔 오류를 남기지 않게)
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { getSessionUser } from '@/lib/auth'

export const GET = withGuard(async (req) => {
  const u = await getSessionUser(req)
  return NextResponse.json(
    {
      user: u
        ? {
            id: u.id,
            username: u.pi_username,
            displayName: u.display_name,
            role: u.role,
          }
        : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
})
