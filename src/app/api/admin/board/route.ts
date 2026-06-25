import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { viewerScopedCacheHeaders } from '@/lib/cache-headers'

// GET /api/admin/board?page=1&limit=30&ctgr=NOTICE
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  const admin = isAdmin(user)
  if (!admin)
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

  const { searchParams } = request.nextUrl
  const page = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit = Math.min(
    50,
    Math.max(1, Number(searchParams.get('limit') ?? 30)),
  )
  const ctgr = searchParams.get('ctgr')?.trim().toUpperCase() ?? ''
  const from = (page - 1) * limit

  const db = getSupabaseAdmin()
  let query = db
    .from('brd_post')
    .select(
      'post_id, ctgr_cd, post_ttl, rgst_usr_nm, vw_cnt, pin_yn, answ_yn, reg_dtm',
      { count: 'exact' },
    )
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })
    .range(from, from + limit - 1)

  if (ctgr) query = query.eq('ctgr_cd', ctgr)

  const { data: posts, count, error } = await query
  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })

  const totalPages = Math.ceil((count ?? 0) / limit)
  return NextResponse.json(
    {
      posts: posts ?? [],
      total: count ?? 0,
      page,
      limit,
      totalPages,
    },
    { headers: viewerScopedCacheHeaders(admin) },
  )
}
