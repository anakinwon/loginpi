import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

  const { id } = await params
  const body = (await req.json()) as {
    term_log_nm?: string
    term_phy_nm?: string
    term_phy_fll_nm?: string
    term_desc?: string
  }

  const patch: Record<string, unknown> = {}
  if (body.term_log_nm !== undefined) patch.term_log_nm = body.term_log_nm.trim()
  if (body.term_phy_nm !== undefined) patch.term_phy_nm = body.term_phy_nm.trim().toLowerCase()
  if (body.term_phy_fll_nm !== undefined) patch.term_phy_fll_nm = body.term_phy_fll_nm.trim().toUpperCase()
  if (body.term_desc !== undefined) patch.term_desc = body.term_desc?.trim() || null

  const { data, error } = await getSupabaseAdmin()
    .from('std_term')
    .update(patch)
    .eq('term_id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: '수정 실패' }, { status: 500 })

  return NextResponse.json({ term: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

  const { id } = await params

  const { error } = await getSupabaseAdmin()
    .from('std_term')
    .delete()
    .eq('term_id', id)

  if (error) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })

  return NextResponse.json({ success: true })
}
