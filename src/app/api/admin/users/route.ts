import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('users')
    .select('id, pi_uid, pi_username, google_email, google_name, display_name, role, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: '사용자 목록 조회 실패' }, { status: 500 })
  }

  return NextResponse.json({ users: data })
}
