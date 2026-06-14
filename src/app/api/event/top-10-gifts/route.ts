import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/event/top-10-gifts — 선착순 10명 + 선물 발송 상태 (관리자 전용)
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  if (!isAdmin(user)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  try {
    const db = getSupabaseAdmin()

    // 1. 미션 M1~M10 모두 완료(mission_count=10)한 사용자 중 제외 대상자 제외
    // 2. 선착순(evt_user_mission 첫 완료 시간의 최솟값) 정렬
    // 3. 상위 10명 추출
    const { data: top10, error: err1 } = await db
      .from('evt_user_mission')
      .select(
        `
        user_id,
        sys_user!inner (id, nick_nm, kakao_id),
        min_complete_dtm:reg_dtm
      `,
      )
      .eq('event_id', 'evt-20260614-001')
      .eq('complete_yn', 'Y')
      .eq('del_yn', 'N')
      // evt_exclude (논리삭제 미적용) 필터는 subquery로 처리해야 하므로
      // 클라이언트에서 필터링하거나 추후 RPC 구현 필요
      .order('reg_dtm', { ascending: true })
      .limit(10)

    if (err1) {
      throw err1
    }

    // 2. 제외 대상자 조회
    const { data: excluded, error: err2 } = await db
      .from('evt_exclude')
      .select('user_id')
      .eq('event_id', 'evt-20260614-001')
      .eq('del_yn', 'N')

    if (err2) {
      throw err2
    }

    const excludedSet = new Set((excluded ?? []).map((e) => e.user_id))

    // 3. 선물 발송 로그 조회
    const { data: gifts, error: err3 } = await db
      .from('evt_gift_log')
      .select('user_id, gift_nm, sent_yn, sent_dtm')
      .eq('event_id', 'evt-20260614-001')
      .eq('del_yn', 'N')

    if (err3) {
      throw err3
    }

    const giftMap = new Map(gifts?.map((g) => [g.user_id, g]))

    // 4. 최종 선착순 10명 구성 (제외 대상자 필터링)
    const result = (top10 ?? [])
      .filter((item) => !excludedSet.has(item.user_id))
      .slice(0, 10)
      .map((item, index) => {
        const sysUserRaw = item.sys_user as unknown
        const sysUser = sysUserRaw as {
          id: string
          nick_nm: string | null
          kakao_id: string | null
        }
        const gift = giftMap.get(item.user_id)

        return {
          rank: index + 1,
          user_id: item.user_id,
          nick_nm: sysUser.nick_nm,
          kakao_id: sysUser.kakao_id,
          sent_yn: gift?.sent_yn ?? 'N',
          sent_dtm: gift?.sent_dtm ?? null,
          gift_nm: gift?.gift_nm ?? 'π 선물',
        }
      })

    return NextResponse.json({ gifts: result })
  } catch (err) {
    console.error('[event/top-10-gifts] 조회 실패:', err)
    return NextResponse.json(
      { error: '선물 조회 실패' },
      { status: 500 },
    )
  }
}
