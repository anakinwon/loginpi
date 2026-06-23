import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// 인프라 사용량 할당(quota) — Vercel(수동)·Supabase DB(자동) 한도 대비 사용량.
// GET: fn_usage_quota(자동 리소스는 사용량 실시간 측정) · PUT: fn_usage_quota_set(수동 갱신)

export async function GET() {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { data, error } = await getSupabaseAdmin().rpc('fn_usage_quota')

  if (error) {
    return NextResponse.json(
      { error: '사용량 조회 실패', detail: error.message },
      { status: 500 },
    )
  }

  return NextResponse.json({ quotas: data ?? [] })
}

export async function PUT(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  let body: { resource_cd?: unknown; limit_amt?: unknown; used_amt?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const cd = typeof body.resource_cd === 'string' ? body.resource_cd : ''
  const limit = Number(body.limit_amt)
  const used = Number(body.used_amt)

  if (!cd) {
    return NextResponse.json({ error: '리소스 코드 누락' }, { status: 400 })
  }
  if (!Number.isFinite(limit) || !Number.isFinite(used)) {
    return NextResponse.json(
      { error: '한도·사용량은 숫자여야 합니다' },
      { status: 400 },
    )
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
      { error: '사용량 갱신 실패', detail: error.message },
      { status: denied ? 400 : 500 },
    )
  }

  return NextResponse.json({ ok: true })
}
