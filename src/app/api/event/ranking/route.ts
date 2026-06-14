import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getEventRanking } from '@/lib/event'

// GET /api/event/ranking?limit=100 — 미션 합계 내림차순 랭킹 (제외 대상자 필터링됨)
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Number(searchParams.get('limit') ?? '100'), 200)

  try {
    const ranking = await getEventRanking('evt-20260614-001', limit)
    return NextResponse.json({ ranking })
  } catch (err) {
    console.error('[event/ranking] 조회 실패:', err)
    return NextResponse.json({ error: '랭킹 조회 실패' }, { status: 500 })
  }
}
