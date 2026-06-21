import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/admin/event/completions — 미션 10/10 전체 완료자 목록 (관리자 전용)
// pi_username, 최종성공일시(last_complete_dtm), kakao_id 반환, 선착순 정렬
export async function GET() {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  if (!isAdmin(user))
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

  const db = getSupabaseAdmin()
  const EVENT_ID = 'evt-20260614-001'

  // 제외 대상자 목록
  const { data: excluded } = await db
    .from('evt_exclude')
    .select('user_id')
    .eq('event_id', EVENT_ID)
    .eq('del_yn', 'N')
  const excludedIds = new Set((excluded ?? []).map((e) => e.user_id))

  // 전체 미션 완료 기록 (FK 부재로 조인 불가 → user_id로 사용자 정보 별도 병합)
  const { data: missions, error } = await db
    .from('evt_user_mission')
    .select('user_id, mission_cd, complete_dtm')
    .eq('event_id', EVENT_ID)
    .eq('del_yn', 'N')

  if (error) {
    console.error('[admin/event/completions] 조회 실패:', error.message)
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }

  type Su = {
    pi_username: string | null
    nick_nm: string | null
    display_name: string | null
    kakao_id: string | null
  }
  const mUserIds = [...new Set((missions ?? []).map((m) => m.user_id))]
  const uMap = new Map<string, Su>()
  if (mUserIds.length > 0) {
    const { data: us } = await db
      .from('sys_user')
      .select('id, pi_username, nick_nm, display_name, kakao_id')
      .in('id', mUserIds)
    for (const u of (us ?? []) as ({ id: string } & Su)[]) uMap.set(u.id, u)
  }

  // 사용자별 집계
  const statsMap = new Map<
    string,
    {
      missionCds: Set<string>
      lastCompleteDtm: string
      pi_username: string | null
      nick_nm: string | null
      display_name: string | null
      kakao_id: string | null
    }
  >()

  for (const m of missions ?? []) {
    if (excludedIds.has(m.user_id)) continue

    const su: Su = uMap.get(m.user_id) ?? {
      pi_username: null,
      nick_nm: null,
      display_name: null,
      kakao_id: null,
    }

    const existing = statsMap.get(m.user_id)
    if (existing) {
      existing.missionCds.add(m.mission_cd.trim())
      if (m.complete_dtm > existing.lastCompleteDtm) {
        existing.lastCompleteDtm = m.complete_dtm
      }
    } else {
      statsMap.set(m.user_id, {
        missionCds: new Set([m.mission_cd.trim()]),
        lastCompleteDtm: m.complete_dtm,
        pi_username: su.pi_username,
        nick_nm: su.nick_nm,
        display_name: su.display_name,
        kakao_id: su.kakao_id,
      })
    }
  }

  // 10/10 완료자만 필터 → 선착순(lastCompleteDtm ASC) 정렬
  const completions = Array.from(statsMap.entries())
    .filter(([, s]) => s.missionCds.size === 10)
    .sort(([, a], [, b]) => a.lastCompleteDtm.localeCompare(b.lastCompleteDtm))
    .map(([userId, s], i) => ({
      rank: i + 1,
      user_id: userId,
      pi_username: s.pi_username,
      nick_nm: s.nick_nm ?? s.display_name,
      kakao_id: s.kakao_id,
      last_complete_dtm: s.lastCompleteDtm,
    }))

  return NextResponse.json({ completions, total: completions.length })
}
