import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeError } from '@/lib/sanitize-error'
import { apiError } from '@/lib/api-errors'

// 인프라 사용량 할당(quota) — Vercel(수동)·Supabase DB(자동) 한도 대비 사용량.
// GET: fn_usage_quota(자동 리소스는 사용량 실시간 측정) · PUT: fn_usage_quota_set(수동 갱신)

export async function GET() {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return apiError('FORBIDDEN', 403)
  }

  const { data, error } = await getSupabaseAdmin().rpc('fn_usage_quota')

  if (error) {
    return NextResponse.json(
      {
        error: sanitizeError('api/admin/usage/get', error, '사용량 조회 실패'),
      },
      { status: 500 },
    )
  }

  return NextResponse.json({ quotas: data ?? [] })
}

export async function PUT(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return apiError('FORBIDDEN', 403)
  }

  let body: { resource_cd?: unknown; limit_amt?: unknown; used_amt?: unknown }
  try {
    body = await req.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }

  const cd = typeof body.resource_cd === 'string' ? body.resource_cd : ''
  const limit = Number(body.limit_amt)
  const used = Number(body.used_amt)

  if (!cd) {
    return apiError('ADM_USAGE_RESOURCE_CD_REQUIRED', 400)
  }
  if (!Number.isFinite(limit) || !Number.isFinite(used)) {
    return apiError('ADM_USAGE_AMOUNTS_NUMERIC', 400)
  }

  const { error } = await getSupabaseAdmin().rpc('fn_usage_quota_set', {
    p_cd: cd,
    p_limit: limit,
    p_used: used,
    p_actor: requester?.id ?? 'ADMIN',
  })

  if (error) {
    const denied = error.code === '22023'
    return NextResponse.json(
      {
        error: sanitizeError('api/admin/usage/put', error, '사용량 갱신 실패'),
      },
      { status: denied ? 400 : 500 },
    )
  }

  return NextResponse.json({ ok: true })
}
