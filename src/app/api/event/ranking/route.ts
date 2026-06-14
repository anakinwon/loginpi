import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getEventRanking } from '@/lib/event'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/event/ranking?limit=100 — 미션 합계 내림차순 랭킹 + M1~M10 체크리스트 (제외 대상자 필터링됨)
export async function GET(request: NextRequest) {
  // 비로그인도 랭킹 조회 가능 (Shop처럼 공개) — 마스킹/관리자 기능은 is_admin으로 분기
  const user = await getSessionUser()

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Number(searchParams.get('limit') ?? '100'), 200)

  try {
    const ranking = await getEventRanking('evt-20260614-001', limit)

    // 각 사용자의 M1~M10 완료 상태 조회
    const userIds = ranking.map((r) => r.user_id)
    const { data: userMissions } = await getSupabaseAdmin()
      .from('evt_user_mission')
      .select('user_id, mission_cd, complete_dtm')
      .eq('event_id', 'evt-20260614-001')
      .eq('del_yn', 'N')
      .in('user_id', userIds)

    // 사용자별 미션 완료 매트릭스 구성 (mission_cd CHAR 패딩 제거)
    const missionMap = new Map<string, Set<string>>()
    ;(userMissions ?? []).forEach((um) => {
      const key = um.user_id
      if (!missionMap.has(key)) {
        missionMap.set(key, new Set())
      }
      missionMap.get(key)!.add(um.mission_cd.trim())
    })

    // 랭킹에 미션 체크리스트 추가
    const rankingWithMissions = ranking.map((r) => ({
      ...r,
      missions: {
        M1: missionMap.get(r.user_id)?.has('M1') ?? false,
        M2: missionMap.get(r.user_id)?.has('M2') ?? false,
        M3: missionMap.get(r.user_id)?.has('M3') ?? false,
        M4: missionMap.get(r.user_id)?.has('M4') ?? false,
        M5: missionMap.get(r.user_id)?.has('M5') ?? false,
        M6: missionMap.get(r.user_id)?.has('M6') ?? false,
        M7: missionMap.get(r.user_id)?.has('M7') ?? false,
        M8: missionMap.get(r.user_id)?.has('M8') ?? false,
        M9: missionMap.get(r.user_id)?.has('M9') ?? false,
        M10: missionMap.get(r.user_id)?.has('M10') ?? false,
      },
    }))

    return NextResponse.json({
      ranking: rankingWithMissions,
      is_admin: user ? isAdmin(user) : false,
    })
  } catch (err) {
    console.error('[event/ranking] 조회 실패:', err)
    return NextResponse.json({ error: '랭킹 조회 실패' }, { status: 500 })
  }
}
