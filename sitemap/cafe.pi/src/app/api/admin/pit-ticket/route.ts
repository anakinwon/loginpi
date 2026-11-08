import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { createPitTicket } from '@/lib/pit-ticket'

// Pi Browser admin 인증용 단기 ticket 발급.
// ClientAdminGate가 piFetch로 호출(X-Pi-Token 헤더 자동 첨부) → Pi 세션 검증 후
// 60초짜리 ticket 반환 → 클라이언트가 ?_pit=ticket으로 내비게이션하면
// 미들웨어가 x-pit-ticket 헤더로 전달 → auth-check가 ticket 검증 후 user 반환.
export async function POST() {
  const user = await getSessionUser()
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ ticket: createPitTicket(user.id) })
}
