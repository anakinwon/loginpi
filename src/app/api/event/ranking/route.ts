import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getEventRanking } from '@/lib/event'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/event/ranking?limit=100&q=검색어
// missions(M1~M10) + reward_st_cd는 getEventRanking에서 함께 반환 — 중복 쿼리 없음
export async function GET(request: NextRequest) {
  // 비로그인도 랭킹 조회 가능 — is_admin 여부만 세션으로 분기
  const user = await getSessionUser()

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Number(searchParams.get('limit') ?? '100'), 200)
  // 요원명 검색 인젝션 방지: 구조 문자 제거 + 길이 제한
  const q = (searchParams.get('q')?.trim() ?? '')
    .replace(/[,()*\\%]/g, '')
    .slice(0, 40)

  try {
    let ranking = await getEventRanking('evt-20260614-001', limit)

    // 검색어 있으면 sys_user pg_trgm(.ilike)로 매칭 ID 조회 후 필터
    // (전체 순위 계산 후 필터 → 검색해도 순위 번호는 전체 기준 유지)
    if (q) {
      const { data: matched } = await getSupabaseAdmin()
        .from('sys_user')
        .select('id')
        .or(`pi_username.ilike.%${q}%,nick_nm.ilike.%${q}%`)
      const matchedIds = new Set(
        (matched ?? []).map((u) => (u as { id: string }).id),
      )
      ranking = ranking.filter((r) => matchedIds.has(r.user_id))
    }

    return NextResponse.json(
      { ranking, is_admin: user ? isAdmin(user) : false },
      {
        headers: {
          'Cache-Control': 'private, max-age=15, stale-while-revalidate=30',
        },
      },
    )
  } catch (err) {
    console.error('[event/ranking] 조회 실패:', err)
    return NextResponse.json({ error: '랭킹 조회 실패' }, { status: 500 })
  }
}
