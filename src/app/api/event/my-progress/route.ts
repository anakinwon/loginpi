import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getEventProgress } from '@/lib/event'

// GET /api/event/my-progress — 사용자 미션 진행도 + 요원 등급 (클라이언트 게이트 사용)
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  try {
    const progress = await getEventProgress(user.id, 'evt-20260614-001')
    return NextResponse.json({ progress })
  } catch (err) {
    console.error('[event/my-progress] 조회 실패:', err)
    return NextResponse.json(
      { error: '미션 진행도 조회 실패' },
      { status: 500 },
    )
  }
}
