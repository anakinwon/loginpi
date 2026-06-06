import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const tbl  = searchParams.get('tbl')  ?? ''
  const from = searchParams.get('from') ?? ''
  const to   = searchParams.get('to')   ?? ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))

  let query = getSupabaseAdmin()
    .from('std_audit_log')
    .select('log_id, tgt_tbl, tgt_id, action_cd, old_val, new_val, chgr_id, chg_dtm', { count: 'exact' })
    .order('chg_dtm', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  if (tbl)  query = query.eq('tgt_tbl', tbl)
  if (from) query = query.gte('chg_dtm', from)
  if (to)   query = query.lte('chg_dtm', `${to}T23:59:59.999Z`)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })

  return NextResponse.json({ logs: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE })
}
