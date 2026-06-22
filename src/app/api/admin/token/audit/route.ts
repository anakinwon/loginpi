import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const limit = Math.min(Number(searchParams.get('limit') ?? '100'), 500)
  const offset = Number(searchParams.get('offset') ?? '0')
  const usrId = searchParams.get('usr_id')

  const db = getSupabaseAdmin()

  let query = db
    .from('bean_audit_log')
    .select(
      `
      audit_id,
      usr_id,
      adj_before,
      adj_bean,
      adj_after,
      reason_txt,
      adj_admin_id,
      evidence_url,
      reg_dtm,
      sys_user:usr_id (
        pi_username,
        nick_nm,
        real_nm
      )
    `,
      { count: 'exact' },
    )
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })
    .range(offset, offset + limit - 1)

  if (usrId) {
    query = query.eq('usr_id', usrId)
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [], total: count ?? 0 })
}
