import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getUserBadges } from '@/lib/chat-badge'
import { apiError } from '@/lib/api-errors'

// GET /api/badges — 내 테마 활동 배지 목록 (TASK-062 Trigger 7)
// ?unnotified=1 — 아직 축하 팝업을 보지 않은 배지만
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const badges = await getUserBadges(user.id)
  const unnotifiedOnly =
    new URL(request.url).searchParams.get('unnotified') === '1'

  return NextResponse.json({
    badges: unnotifiedOnly ? badges.filter((b) => b.noti_yn === 'N') : badges,
  })
}
