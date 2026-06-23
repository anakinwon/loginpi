import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// LIKE 와일드카드(%, _, \) 이스케이프 — 사용자 입력이 패턴으로 오작동/주입되지 않게.
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&')
}

export async function GET(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()

  let query = getSupabaseAdmin()
    .from('sys_user')
    .select(
      'id, pi_uid, pi_username, google_id, google_email, google_name, display_name, role, reg_dtm',
    )
    .order('reg_dtm', { ascending: false })

  // 검색어가 있으면(2글자↑) pi_username 부분일치(trigram GIN, sql/086)로 좁힌다.
  // trigram은 3글자 단위라 2글자 미만은 의미가 적어 검색 자체를 생략(전체 반환).
  if (q.length >= 2) {
    query = query.ilike('pi_username', `%${escapeLike(q)}%`)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: '연동 현황 조회 실패' }, { status: 500 })
  }

  return NextResponse.json({ users: data })
}
