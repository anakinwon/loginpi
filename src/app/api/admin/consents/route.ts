import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

// 약관/동의 내역 (관리자 전용) — sys_user_consent 이력을 "사용자별 1행"으로 집계.
// 유형별 최신 상태만 투영(reg_dtm DESC 첫 등장=최신). FK 미설계 → sys_user 별도 .in() 병합.
const TYPES = ['TERMS', 'PRIVACY', 'LBS', 'MKT', 'AGE14', 'GUARDIAN'] as const
const SCAN_LIMIT = 5000 // 집계 대상 최근 이력 상한(Open Beta 규모 충분)

interface ConsentRow {
  user_str_id: string
  consent_tp_cd: string
  consent_yn: string
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
    return apiError('FORBIDDEN', 403)
  }

  const sp = req.nextUrl.searchParams
  const q = (sp.get('q')?.trim() ?? '').replace(/[,()*\\%]/g, '').slice(0, 40)
  const page = Math.max(1, Number(sp.get('page') ?? 1))
  const limit = 30

  const db = getSupabaseAdmin()

  // 요원명 검색 → 매칭 user id 선조회
  let userIds: string[] | null = null
  if (q) {
    const { data: us } = await db
      .from('sys_user')
      .select('id')
      .or(
        `pi_username.ilike.%${q}%,nick_nm.ilike.%${q}%,display_name.ilike.%${q}%`,
      )
      .limit(300)
    userIds = (us ?? []).map((u) => (u as { id: string }).id)
    if (userIds.length === 0) {
      return NextResponse.json({ rows: [], total: 0, page, limit })
    }
  }

  let query = db
    .from('sys_user_consent')
    .select('user_str_id, consent_tp_cd, consent_yn, reg_dtm')
    .eq('del_yn', 'N')
  if (userIds) query = query.in('user_str_id', userIds)
  query = query.order('reg_dtm', { ascending: false }).limit(SCAN_LIMIT)

  const { data, error } = await query
  if (error) {
    return apiError('QUERY_FAILED', 500)
  }
  const rows = (data ?? []) as ConsentRow[]

  // 사용자별 유형 최신 상태 집계 (DESC 정렬이라 첫 등장=최신)
  interface Agg {
    user_str_id: string
    status: Record<string, string> // type → 'Y'|'N'
    latest_dtm: string
  }
  const map = new Map<string, Agg>()
  for (const r of rows) {
    let a = map.get(r.user_str_id)
    if (!a) {
      a = { user_str_id: r.user_str_id, status: {}, latest_dtm: r.reg_dtm }
      map.set(r.user_str_id, a)
    }
    if (!(r.consent_tp_cd in a.status)) a.status[r.consent_tp_cd] = r.consent_yn
    if (r.reg_dtm > a.latest_dtm) a.latest_dtm = r.reg_dtm
  }

  // 최근 동의순 정렬 후 사용자 단위 페이지네이션
  const users = [...map.values()].sort((x, y) =>
    y.latest_dtm.localeCompare(x.latest_dtm),
  )
  const total = users.length
  const pageUsers = users.slice((page - 1) * limit, (page - 1) * limit + limit)

  // 사용자명 병합
  const ids = pageUsers.map((u) => u.user_str_id)
  const nameMap = new Map<string, UserRow>()
  if (ids.length > 0) {
    const { data: su } = await db
      .from('sys_user')
      .select('id, pi_username, nick_nm, display_name')
      .in('id', ids)
    for (const u of (su ?? []) as UserRow[]) nameMap.set(u.id, u)
  }

  const result = pageUsers.map((u) => {
    const n = nameMap.get(u.user_str_id)
    const status: Record<string, string | null> = {}
    for (const t of TYPES) status[t] = u.status[t] ?? null
    return {
      user_str_id: u.user_str_id,
      user_nm:
        n?.nick_nm ||
        n?.display_name ||
        n?.pi_username ||
        u.user_str_id.slice(0, 8),
      pi_username: n?.pi_username ?? null,
      status,
      latest_dtm: u.latest_dtm,
    }
  })

  return NextResponse.json({ rows: result, total, page, limit })
}
