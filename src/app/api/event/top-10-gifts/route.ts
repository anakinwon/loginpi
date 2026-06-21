import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/event/top-10-gifts — 미션 10/10 선착순 상위 10명 + 선물 발송 상태 (관리자 전용)
export async function GET() {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  if (!isAdmin(user))
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

  try {
    const db = getSupabaseAdmin()
    const EVENT_ID = 'evt-20260614-001'

    // 제외 대상자 조회
    const { data: excluded } = await db
      .from('evt_exclude')
      .select('user_id')
      .eq('event_id', EVENT_ID)
      .eq('del_yn', 'N')
    const excludedSet = new Set((excluded ?? []).map((e) => e.user_id))

    // 전체 미션 기록 조회 (FK 부재로 조인 불가 → user_id로 별도 병합)
    const { data: missions, error: err1 } = await db
      .from('evt_user_mission')
      .select('user_id, mission_cd, complete_dtm')
      .eq('event_id', EVENT_ID)
      .eq('del_yn', 'N')

    if (err1) throw err1

    type Su = { nick_nm: string | null; kakao_id: string | null }
    const mUserIds = [...new Set((missions ?? []).map((m) => m.user_id))]
    const uMap = new Map<string, Su>()
    if (mUserIds.length > 0) {
      const { data: us } = await db
        .from('sys_user')
        .select('id, nick_nm, kakao_id')
        .in('id', mUserIds)
      for (const u of (us ?? []) as ({ id: string } & Su)[]) uMap.set(u.id, u)
    }

    // 사용자별 집계: 제외 대상자 제외, mission_cd Set + 마지막 완료 시간
    const statsMap = new Map<
      string,
      {
        missionCds: Set<string>
        lastCompleteDtm: string
        nick_nm: string | null
        kakao_id: string | null
      }
    >()

    for (const m of missions ?? []) {
      if (excludedSet.has(m.user_id)) continue
      const su: Su = uMap.get(m.user_id) ?? { nick_nm: null, kakao_id: null }
      const existing = statsMap.get(m.user_id)
      if (existing) {
        existing.missionCds.add(m.mission_cd.trim())
        if (m.complete_dtm > existing.lastCompleteDtm)
          existing.lastCompleteDtm = m.complete_dtm
      } else {
        statsMap.set(m.user_id, {
          missionCds: new Set([m.mission_cd.trim()]),
          lastCompleteDtm: m.complete_dtm,
          nick_nm: su.nick_nm,
          kakao_id: su.kakao_id,
        })
      }
    }

    // 10/10 완료자만 → 선착순(lastCompleteDtm ASC) → 상위 10명
    const top10 = Array.from(statsMap.entries())
      .filter(([, s]) => s.missionCds.size === 10)
      .sort(([, a], [, b]) =>
        a.lastCompleteDtm.localeCompare(b.lastCompleteDtm),
      )
      .slice(0, 10)
      .map(([userId, s]) => ({ userId, ...s }))

    // 선물 발송 로그 조회
    const { data: gifts, error: err2 } = await db
      .from('evt_gift_log')
      .select('user_id, gift_nm, sent_yn, sent_dtm')
      .eq('event_id', EVENT_ID)
      .eq('del_yn', 'N')

    if (err2) throw err2

    const giftMap = new Map(gifts?.map((g) => [g.user_id, g]))

    const result = top10.map((u, i) => {
      const gift = giftMap.get(u.userId)
      return {
        rank: i + 1,
        user_id: u.userId,
        nick_nm: u.nick_nm,
        kakao_id: u.kakao_id,
        sent_yn: gift?.sent_yn ?? 'N',
        sent_dtm: gift?.sent_dtm ?? null,
        gift_nm: gift?.gift_nm ?? 'π 선물',
      }
    })

    return NextResponse.json({ gifts: result })
  } catch (err) {
    console.error('[event/top-10-gifts] 조회 실패:', err)
    return NextResponse.json({ error: '선물 조회 실패' }, { status: 500 })
  }
}
