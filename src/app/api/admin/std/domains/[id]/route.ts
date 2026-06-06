import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { id } = await params
  const body = (await req.json()) as {
    dom_nm?: string
    key_dom_nm?: string
    key_dom_phy_nm?: string
    dom_type_cd?: string
    data_type_cd?: string
    data_len?: number | null
    data_scale?: number | null
    dom_desc?: string
  }

  const patch: Record<string, unknown> = {}
  if (body.dom_nm !== undefined) patch.dom_nm = body.dom_nm.trim()
  if (body.key_dom_nm !== undefined) patch.key_dom_nm = body.key_dom_nm.trim()
  if (body.key_dom_phy_nm !== undefined) patch.key_dom_phy_nm = body.key_dom_phy_nm.trim().toUpperCase()
  if (body.dom_type_cd !== undefined) patch.dom_type_cd = body.dom_type_cd
  if (body.data_type_cd !== undefined) patch.data_type_cd = body.data_type_cd
  if (body.data_len !== undefined) patch.data_len = body.data_len
  if (body.data_scale !== undefined) patch.data_scale = body.data_scale
  if (body.dom_desc !== undefined) patch.dom_desc = body.dom_desc?.trim() || null
  patch.modr_id = requester?.id ?? null

  const { data, error } = await getSupabaseAdmin()
    .from('std_dom')
    .update(patch)
    .eq('dom_id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: '수정 실패' }, { status: 500 })

  return NextResponse.json({ domain: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { id } = await params

  const { error } = await getSupabaseAdmin()
    .from('std_dom')
    .update({ del_yn: 'Y', mod_dtm: new Date().toISOString(), modr_id: requester?.id ?? null })
    .eq('dom_id', id)

  if (error) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })

  return NextResponse.json({ success: true })
}
