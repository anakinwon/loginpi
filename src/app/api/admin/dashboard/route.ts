import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

// GET /api/admin/dashboard — 사용자 연동 통계 카드 (관리자 대시보드)
// 클라이언트 fetch 전환: Pi Browser는 쿠키가 없어 SSR에서 통계가 0으로 표시되던 문제 해결
// (piFetch X-Pi-Token 헤더 + 쿠키 이중 경로 자동 지원)
export async function GET() {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return apiError('FORBIDDEN', 401)
  }

  const db = getSupabaseAdmin()
  const [
    { count: total },
    { count: piOnly },
    { count: googleOnly },
    { count: linked },
  ] = await Promise.all([
    db.from('sys_user').select('*', { count: 'exact', head: true }),
    db
      .from('sys_user')
      .select('*', { count: 'exact', head: true })
      .not('pi_uid', 'is', null)
      .is('google_id', null),
    db
      .from('sys_user')
      .select('*', { count: 'exact', head: true })
      .is('pi_uid', null)
      .not('google_id', 'is', null),
    db
      .from('sys_user')
      .select('*', { count: 'exact', head: true })
      .not('pi_uid', 'is', null)
      .not('google_id', 'is', null),
  ])

  return NextResponse.json({
    total: total ?? 0,
    piOnly: piOnly ?? 0,
    googleOnly: googleOnly ?? 0,
    linked: linked ?? 0,
  })
}
