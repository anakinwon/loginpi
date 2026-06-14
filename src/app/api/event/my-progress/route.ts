import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getEventProgress } from '@/lib/event'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/event/my-progress — 사용자 미션 진행도 + 요원 등급 + 안내문 (클라이언트 게이트 사용)
export async function GET() {
  // 비로그인도 미션 안내는 공개 (Shop처럼 게스트 접근 허용 — 클라이언트 게이트)
  const user = await getSessionUser()

  try {
    const { data: missions } = await getSupabaseAdmin()
      .from('evt_mission')
      .select('mission_cd, mission_nm, mission_guide_desc, complete_type_cd, mission_ord')
      .eq('event_id', 'evt-20260614-001')
      .eq('del_yn', 'N')
      .order('mission_ord', { ascending: true })

    // mission_cd CHAR 패딩 제거
    const trimmedMissions = (missions ?? []).map((m) => ({
      ...m,
      mission_cd: m.mission_cd.trim(),
    }))

    // 로그인 사용자만 개인 진행도 계산, 비로그인은 null
    const progress = user
      ? await getEventProgress(user.id, 'evt-20260614-001')
      : null

    return NextResponse.json({ progress, missions: trimmedMissions })
  } catch (err) {
    console.error('[event/my-progress] 조회 실패:', err)
    return NextResponse.json(
      { error: '미션 진행도 조회 실패' },
      { status: 500 },
    )
  }
}
