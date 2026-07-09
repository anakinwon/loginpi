import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getEventProgress } from '@/lib/event'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

// GET /api/event/my-progress — 사용자 미션 진행도 + 요원 등급 + 안내문
export async function GET() {
  const user = await getSessionUser()

  try {
    // evt_mission 조회 + 개인 진행도 계산 병렬 실행 (순차 2쿼리 → 병렬)
    const [missionsResult, progress] = await Promise.all([
      getSupabaseAdmin()
        .from('evt_mission')
        .select(
          'mission_cd, mission_nm, mission_guide_desc, complete_type_cd, mission_ord',
        )
        .eq('event_id', 'evt-20260614-001')
        .eq('del_yn', 'N')
        .order('mission_ord', { ascending: true }),
      user
        ? getEventProgress(user.id, 'evt-20260614-001')
        : Promise.resolve(null),
    ])

    const trimmedMissions = (missionsResult.data ?? []).map((m) => ({
      ...m,
      mission_cd: m.mission_cd.trim(),
    }))

    return NextResponse.json({ progress, missions: trimmedMissions })
  } catch (err) {
    console.error('[event/my-progress] 조회 실패:', err)
    return apiError('EVENT_PROGRESS_QUERY_FAILED', 500)
  }
}
