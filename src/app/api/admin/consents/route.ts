import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// 약관/동의 내역 조회 (관리자 전용) — sys_user_consent 이력.
// FK 미설계 → 임베디드 조인 금지. 사용자명은 user_str_id로 sys_user 별도 .in() 조회 후 Map 병합.

interface ConsentRow {
  consent_id: string
  user_str_id: string
  consent_tp_cd: string
  consent_yn: string
  consent_ver: string | null
  client_ip: string | null
  reg_dtm: string
}
interface UserRow {
  id: string
  pi_username: string | null
  nick_nm: string | null
  display_name: string | null
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const type = sp.get('type') ?? '' // TERMS/PRIVACY/LBS/MKT/AGE14/GUARDIAN
  const q = (sp.get('q')?.trim() ?? '').replace(/[,()*\\%]/g, '').slice(0, 40)
  const page = Math.max(1, Number(sp.get('page') ?? 1))
  const limit = 30
  const from = (page - 1) * limit
  const to = from + limit - 1

  const db = getSupabaseAdmin()

  // 요원명 검색 → 매칭 user id 집합 선조회(pg_trgm .ilike)
  let userIds: string[] | null = null
  if (q) {
    const { data: us } = await db
      .from('sys_user')
      .select('id')
      .or(`pi_username.ilike.%${q}%,nick_nm.ilike.%${q}%,display_name.ilike.%${q}%`)
      .limit(300)
    userIds = (us ?? []).map((u) => (u as { id: string }).id)
    if (userIds.length === 0) {
      return NextResponse.json({ rows: [], total: 0, page, limit })
    }
  }

  let query = db
    .from('sys_user_consent')
    .select(
      'consent_id, user_str_id, consent_tp_cd, consent_yn, consent_ver, client_ip, reg_dtm',
      { count: 'exact' },
    )
    .eq('del_yn', 'N')
  if (type) query = query.eq('consent_tp_cd', type)
  if (userIds) query = query.in('user_str_id', userIds)
  query = query.order('reg_dtm', { ascending: false }).range(from, to)

  const { data, count, error } = await query
  if (error) {
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }
  const rows = (data ?? []) as ConsentRow[]

  // 사용자명 병합 (FK 없는 별도 조회)
  const ids = [...new Set(rows.map((r) => r.user_str_id))]
  const nameMap = new Map<string, UserRow>()
  if (ids.length > 0) {
    const { data: users } = await db
      .from('sys_user')
      .select('id, pi_username, nick_nm, display_name')
      .in('id', ids)
    for (const u of (users ?? []) as UserRow[]) nameMap.set(u.id, u)
  }

  const merged = rows.map((r) => {
    const u = nameMap.get(r.user_str_id)
    return {
      ...r,
      user_nm:
        u?.nick_nm || u?.display_name || u?.pi_username || r.user_str_id.slice(0, 8),
      pi_username: u?.pi_username ?? null,
    }
  })

  return NextResponse.json({ rows: merged, total: count ?? 0, page, limit })
}
