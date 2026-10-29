// 현재 로그인 사용자 — Pi 세션 OR Google 연동 세션(통합 getSessionUser). 클라이언트 통합 게이트(useAppUser)용.
// 미로그인은 200 {user:null}(401 아님 — 세션 폴링이 콘솔 오류를 남기지 않게)
// linked = Google 계정 연동 완료(sys_usr_auth_lnk) — 헤더 '계정 연동' 메뉴 숨김용. 조회 실패는 false(메뉴가 보일 뿐)
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/api'

export const GET = withGuard(async (req) => {
  const u = await getSessionUser(req)
  const lnk = u
    ? await db()
        .from('sys_usr_auth_lnk')
        .select('usr_id')
        .eq('usr_id', u.id)
        .eq('prvd_cd', 'GOOGLE')
        .eq('del_yn', 'N')
        .limit(1)
    : null
  return NextResponse.json(
    {
      user: u
        ? {
            id: u.id,
            username: u.pi_username,
            displayName: u.display_name,
            role: u.role,
            linked: !!lnk?.data?.length,
          }
        : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
})
