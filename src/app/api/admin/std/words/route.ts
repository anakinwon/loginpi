import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

export async function GET(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return apiError('FORBIDDEN', 403)
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')?.trim() ?? ''

  let query = getSupabaseAdmin()
    .from('std_dic')
    .select(
      'dic_id, dic_log_nm, dic_phy_nm, dic_phy_fll_nm, dic_desc, data_type, data_len, apv_status, synced_at, reg_dtm, mod_dtm, regr_id',
    )
    .eq('del_yn', 'N')
    .order('dic_log_nm', { ascending: true })

  if (search) {
    const s = search.replace(/[%_\\]/g, '\\$&')
    query = query.or(
      `dic_log_nm.ilike.%${s}%,dic_phy_nm.ilike.%${s}%,dic_phy_fll_nm.ilike.%${s}%`,
    )
  }

  const { data, error } = await query
  if (error) return apiError('QUERY_FAILED', 500)

  return NextResponse.json({ words: data })
}

export async function POST(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return apiError('FORBIDDEN', 403)
  }

  const body = (await req.json()) as {
    dic_log_nm: string
    dic_phy_nm: string
    dic_phy_fll_nm?: string
    dic_desc?: string
    data_type?: string
    data_len?: number
  }

  if (!body.dic_log_nm?.trim() || !body.dic_phy_nm?.trim()) {
    return apiError('ADM_STD_LOGICAL_PHYSICAL_REQUIRED', 400)
  }

  const { data, error } = await getSupabaseAdmin()
    .from('std_dic')
    .insert({
      dic_id: crypto.randomUUID(),
      dic_log_nm: body.dic_log_nm.trim(),
      dic_phy_nm: body.dic_phy_nm.trim().toUpperCase(),
      dic_phy_fll_nm: body.dic_phy_fll_nm?.trim() ?? null,
      dic_desc: body.dic_desc?.trim() ?? null,
      dic_gbn_cd: '0001',
      data_type: body.data_type ?? null,
      data_len: body.data_len ?? null,
      apv_status: 'APPROVED',
      regr_id: requester?.id ?? null,
    })
    .select()
    .single()

  if (error) return apiError('ADM_REGISTER_FAILED', 500)

  return NextResponse.json({ word: data }, { status: 201 })
}
