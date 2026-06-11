import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { id } = await params
  const body = (await req.json()) as {
    dic_log_nm?: string
    dic_phy_nm?: string
    dic_phy_fll_nm?: string
    dic_desc?: string
    dic_gbn_cd?: string
    data_type?: string
    data_len?: number | null
  }

  const patch: Record<string, unknown> = {}
  if (body.dic_log_nm !== undefined) patch.dic_log_nm = body.dic_log_nm.trim()
  if (body.dic_phy_nm !== undefined)
    patch.dic_phy_nm = body.dic_phy_nm.trim().toUpperCase()
  if (body.dic_phy_fll_nm !== undefined)
    patch.dic_phy_fll_nm = body.dic_phy_fll_nm?.trim().toUpperCase() || null
  if (body.dic_desc !== undefined)
    patch.dic_desc = body.dic_desc?.trim() || null
  if (body.dic_gbn_cd !== undefined) patch.dic_gbn_cd = body.dic_gbn_cd
  if (body.data_type !== undefined) patch.data_type = body.data_type || null
  if (body.data_len !== undefined) patch.data_len = body.data_len
  patch.modr_id = requester?.id ?? null

  const { data, error } = await getSupabaseAdmin()
    .from('std_dic')
    .update(patch)
    .eq('dic_id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: '수정 실패' }, { status: 500 })

  return NextResponse.json({ word: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { id } = await params

  const { error } = await getSupabaseAdmin()
    .from('std_dic')
    .update({
      del_yn: 'Y',
      mod_dtm: new Date().toISOString(),
      modr_id: requester?.id ?? null,
    })
    .eq('dic_id', id)

  if (error) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })

  return NextResponse.json({ success: true })
}
