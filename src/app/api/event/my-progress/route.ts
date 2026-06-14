import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getEventProgress } from '@/lib/event'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/event/my-progress — 사용자 미션 진행도 + 요원 등급 + 안내문 (클라이언트 게이트 사용)
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  try {
    const [progress, { data: missions }] = await Promise.all([
      getEventProgress(user.id, 'evt-20260614-001'),
      getSupabaseAdmin()
        .from('evt_mission')
        .select('mission_cd, mission_nm, mission_guide_desc, complete_type_cd, mission_ord')
        .eq('event_id', 'evt-20260614-001')
        .eq('del_yn', 'N')
        .order('mission_ord', { ascending: true }),
    ])

    return NextResponse.json({ progress, missions: missions ?? [] })
  } catch (err) {
    console.error('[event/my-progress] 조회 실패:', err)
    return NextResponse.json(
      { error: '미션 진행도 조회 실패' },
      { status: 500 },
    )
  }
}
