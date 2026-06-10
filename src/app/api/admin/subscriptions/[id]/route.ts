import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { id } = await params
  const body = (await req.json()) as { extend_months?: number; plan_cd?: string }
  const now = new Date()
  const patch: Record<string, unknown> = {
    modr_id: requester?.display_name ?? 'ADMIN',
    mod_dtm: now.toISOString(),
  }

  if (body.extend_months && body.extend_months > 0) {
    // 현재 만료일 기준으로 연장
    const { data } = await getSupabaseAdmin()
      .from('msg_subscr')
      .select('expire_dtm')
      .eq('subscr_id', id)
      .maybeSingle()

    const base = data?.expire_dtm ? new Date(data.expire_dtm) : now
    // 이미 만료된 경우 오늘부터 연장
    const from = base < now ? now : base
    from.setMonth(from.getMonth() + body.extend_months)
    patch.expire_dtm = from.toISOString()
  }

  if (body.plan_cd) {
    patch.plan_cd = body.plan_cd
  }

  const { error } = await getSupabaseAdmin()
    .from('msg_subscr')
    .update(patch)
    .eq('subscr_id', id)

  if (error) {
    return NextResponse.json({ error: '수정 실패: ' + error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { id } = await params
  const now = new Date()

  const { error } = await getSupabaseAdmin()
    .from('msg_subscr')
    .update({
      del_yn: 'Y',
      del_dtm: now.toISOString(),
      modr_id: requester?.display_name ?? 'ADMIN',
      mod_dtm: now.toISOString(),
    })
    .eq('subscr_id', id)

  if (error) {
    return NextResponse.json({ error: '취소 실패: ' + error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
