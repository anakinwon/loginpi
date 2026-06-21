import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// LIKE 와일드카드(%, _, \) 이스케이프 — 사용자 입력이 패턴으로 오작동/주입되지 않게.
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&')
}

// bean_subscr는 sys_user로의 FK가 없어 PostgREST 임베디드 조인이 불가하다.
// → 구독 조회 후 usr_id 목록으로 sys_user를 별도 조회해 코드에서 매핑(getChatPlan과 동일 패턴).
// q(검색어)가 오면 sys_user.pi_username을 trigram GIN(.ilike)으로 먼저 좁힌다.
export async function GET(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const sb = getSupabaseAdmin()
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()

  // 1) 검색어가 있으면(2글자↑) pi_username 부분일치로 usr_id 후보를 먼저 구한다.
  //    trigram은 3글자 단위라 2글자 미만은 의미가 적어 검색 자체를 생략(전체 반환).
  let matchedIds: string[] | null = null
  if (q.length >= 2) {
    const { data: users } = await sb
      .from('sys_user')
      .select('id')
      .ilike('pi_username', `%${escapeLike(q)}%`)
    matchedIds = (users ?? []).map((u) => u.id)
    // 매칭 사용자가 없으면 구독도 없음 — 빈 결과 즉시 반환
    if (matchedIds.length === 0) {
      return NextResponse.json({ subscriptions: [] })
    }
  }

  // 2) 구독 조회 (검색 시 usr_id 후보로 한정)
  let query = sb
    .from('bean_subscr')
    .select(
      `subscr_id, usr_id, prod_ctgr_cd, grade_cd, bill_cycle_cd,
       fee_plan_cd, bean_amt, start_dtm, expire_dtm, auto_renew_yn`,
    )
    .eq('del_yn', 'N')
  if (matchedIds) query = query.in('usr_id', matchedIds)

  const { data: subs, error } = await query.order('reg_dtm', {
    ascending: false,
  })

  if (error) {
    return NextResponse.json({ error: '구독 목록 조회 실패' }, { status: 500 })
  }

  const rows = subs ?? []
  const userIds = [...new Set(rows.map((r) => r.usr_id))]

  // 3) 사용자 정보 일괄 조회 → id 기준 맵 구성
  const userMap = new Map<
    string,
    {
      id: string
      display_name: string
      pi_username: string | null
      google_email: string | null
    }
  >()
  if (userIds.length > 0) {
    const { data: users } = await sb
      .from('sys_user')
      .select('id, display_name, pi_username, google_email')
      .in('id', userIds)
    for (const u of users ?? []) userMap.set(u.id, u)
  }

  const subscriptions = rows.map((r) => ({
    ...r,
    sys_user: userMap.get(r.usr_id) ?? null,
  }))

  return NextResponse.json({ subscriptions })
}
