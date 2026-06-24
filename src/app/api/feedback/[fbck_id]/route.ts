import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

interface Params {
  params: Promise<{ fbck_id: string }>
}

// PATCH /api/feedback/[fbck_id] — 24시간 내 수정 (Bean 재지급 없음)
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { fbck_id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })

  const { fbck_scr, fbck_cn } = body as { fbck_scr?: number; fbck_cn?: string }

  if (fbck_scr !== undefined && (fbck_scr < 1 || fbck_scr > 5)) {
    return NextResponse.json({ error: '별점은 1~5점이어야 합니다' }, { status: 400 })
  }
  if (fbck_cn !== undefined && fbck_cn.trim().length < 10) {
    return NextResponse.json({ error: '후기 본문은 최소 10자 이상이어야 합니다' }, { status: 400 })
  }

  const db = getSupabaseAdmin()
  const { data: existing } = await db
    .from('fbck_mst')
    .select('fbck_id, usr_id, reg_dtm')
    .eq('fbck_id', fbck_id)
    .eq('del_yn', 'N')
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: '후기를 찾을 수 없습니다' }, { status: 404 })

  const row = existing as { fbck_id: string; usr_id: string; reg_dtm: string }
  if (row.usr_id !== user.id) {
    return NextResponse.json({ error: '본인 후기만 수정할 수 있습니다' }, { status: 403 })
  }

  // 24시간 제한
  const writtenAt = new Date(row.reg_dtm).getTime()
  const elapsed = Date.now() - writtenAt
  if (elapsed > 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: '후기는 작성 후 24시간 내에만 수정할 수 있습니다' }, { status: 403 })
  }

  const updates: Record<string, unknown> = { modr_id: user.id }
  if (fbck_scr !== undefined) updates.fbck_scr = Number(fbck_scr)
  if (fbck_cn !== undefined) updates.fbck_cn = fbck_cn.trim()

  const { error } = await db.from('fbck_mst').update(updates).eq('fbck_id', fbck_id)
  if (error) return NextResponse.json({ error: '수정 실패' }, { status: 500 })

  return NextResponse.json({
    fbck_id,
    message: '후기가 수정되었습니다. (Bean 재보상 없음)',
  })
}

// DELETE /api/feedback/[fbck_id] — 논리 삭제
export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { fbck_id } = await params
  const db = getSupabaseAdmin()

  const { data: existing } = await db
    .from('fbck_mst')
    .select('fbck_id, usr_id')
    .eq('fbck_id', fbck_id)
    .eq('del_yn', 'N')
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: '후기를 찾을 수 없습니다' }, { status: 404 })

  const row = existing as { fbck_id: string; usr_id: string }
  if (row.usr_id !== user.id) {
    return NextResponse.json({ error: '본인 후기만 삭제할 수 있습니다' }, { status: 403 })
  }

  const { error } = await db
    .from('fbck_mst')
    .update({ del_yn: 'Y', del_dtm: new Date().toISOString(), modr_id: user.id })
    .eq('fbck_id', fbck_id)

  if (error) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })

  return NextResponse.json({ ok: true, message: '후기가 삭제되었습니다.' })
}
