import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { viewerScopedCacheHeaders } from '@/lib/cache-headers'
import { apiError } from '@/lib/api-errors'

// GET /api/admin/users?page=1&limit=30
export async function GET(request: NextRequest) {
  const requester = await getSessionUser()
  const admin = isAdmin(requester)
  if (!admin) {
    return apiError('FORBIDDEN', 403)
  }

  // 페이지네이션: page(1 기반), limit(기본 30, 최대 100)
  const sp = request.nextUrl.searchParams
  const page = Math.max(1, Number(sp.get('page') ?? 1))
  const limit = Math.min(100, Math.max(1, Number(sp.get('limit') ?? 30)))
  const from = (page - 1) * limit

  const db = getSupabaseAdmin()
  const {
    data: users,
    count,
    error,
  } = await db
    .from('sys_user')
    .select(
      'id, pi_uid, pi_username, google_email, google_name, display_name, role, reg_dtm, last_login_dtm',
      { count: 'exact' },
    )
    .order('reg_dtm', { ascending: false })
    .range(from, from + limit - 1)

  if (error) {
    return apiError('ADM_USER_LIST_FAILED', 500)
  }

  const totalPages = Math.ceil((count ?? 0) / limit)
  return NextResponse.json(
    {
      users: users ?? [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages,
      },
    },
    { headers: viewerScopedCacheHeaders(admin) },
  )
}
