import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

export async function GET(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) return apiError('FORBIDDEN', 403)

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')?.trim() ?? ''

  let query = getSupabaseAdmin()
    .from('std_term')
    .select(
      'term_id, term_log_nm, term_phy_nm, term_phy_fll_nm, term_desc, apv_status, synced_at, reg_dtm, mod_dtm, regr_id',
    )
    .eq('del_yn', 'N')
    .order('term_log_nm', { ascending: true })

  if (search) {
    const s = search.replace(/[%_\\]/g, '\\$&')
    query = query.or(`term_log_nm.ilike.%${s}%,term_phy_nm.ilike.%${s}%`)
  }

  const { data, error } = await query
  if (error) return apiError('QUERY_FAILED', 500)

  return NextResponse.json({ terms: data })
}

export async function POST(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) return apiError('FORBIDDEN', 403)

  const body = (await req.json()) as {
    term_log_nm: string
    term_phy_nm: string
    term_phy_fll_nm?: string
    term_desc?: string
  }

  if (!body.term_log_nm?.trim() || !body.term_phy_nm?.trim()) {
    return apiError('ADM_STD_LOGICAL_PHYSICAL_REQUIRED', 400)
  }

  const { data, error } = await getSupabaseAdmin()
    .from('std_term')
    .insert({
      term_log_nm: body.term_log_nm.trim(),
      term_phy_nm: body.term_phy_nm.trim().toLowerCase(),
      term_phy_fll_nm: body.term_phy_fll_nm?.trim().toUpperCase() ?? null,
      term_desc: body.term_desc?.trim() ?? null,
      apv_status: 'APPROVED',
      regr_id: requester?.id ?? null,
    })
    .select()
    .single()

  if (error) return apiError('ADM_REGISTER_FAILED', 500)

  return NextResponse.json({ term: data }, { status: 201 })
}
