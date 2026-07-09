import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) return apiError('FORBIDDEN', 403)

  const { id } = await params
  const body = (await req.json()) as {
    term_log_nm?: string
    term_phy_nm?: string
    term_phy_fll_nm?: string
    term_desc?: string
  }

  const patch: Record<string, unknown> = {}
  if (body.term_log_nm !== undefined)
    patch.term_log_nm = body.term_log_nm.trim()
  if (body.term_phy_nm !== undefined)
    patch.term_phy_nm = body.term_phy_nm.trim().toLowerCase()
  if (body.term_phy_fll_nm !== undefined)
    patch.term_phy_fll_nm = body.term_phy_fll_nm.trim().toUpperCase()
  if (body.term_desc !== undefined)
    patch.term_desc = body.term_desc?.trim() || null
  patch.modr_id = requester?.id ?? null

  const { data, error } = await getSupabaseAdmin()
    .from('std_term')
    .update(patch)
    .eq('term_id', id)
    .select()
    .single()

  if (error) return apiError('UPDATE_FAILED', 500)

  return NextResponse.json({ term: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) return apiError('FORBIDDEN', 403)

  const { id } = await params

  const { error } = await getSupabaseAdmin()
    .from('std_term')
    .update({
      del_yn: 'Y',
      mod_dtm: new Date().toISOString(),
      modr_id: requester?.id ?? null,
    })
    .eq('term_id', id)

  if (error) return apiError('DELETE_FAILED', 500)

  return NextResponse.json({ success: true })
}
