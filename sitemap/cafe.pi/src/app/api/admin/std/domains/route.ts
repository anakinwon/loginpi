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
  const typeFilter = searchParams.get('type') ?? ''

  let query = getSupabaseAdmin()
    .from('std_dom')
    .select(
      'dom_id, dom_nm, key_dom_nm, key_dom_phy_nm, dom_type_cd, data_type_cd, data_len, data_scale, dom_desc, synced_at, reg_dtm, mod_dtm, regr_id',
    )
    .eq('del_yn', 'N')
    .order('dom_nm', { ascending: true })

  if (typeFilter) query = query.eq('dom_type_cd', typeFilter)

  if (search) {
    const s = search.replace(/[%_\\]/g, '\\$&')
    query = query.or(
      `dom_nm.ilike.%${s}%,key_dom_nm.ilike.%${s}%,key_dom_phy_nm.ilike.%${s}%`,
    )
  }

  const { data, error } = await query
  if (error) return apiError('QUERY_FAILED', 500)

  return NextResponse.json({ domains: data })
}

export async function POST(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return apiError('FORBIDDEN', 403)
  }

  const body = (await req.json()) as {
    dom_nm: string
    key_dom_nm: string
    key_dom_phy_nm: string
    dom_type_cd: string
    data_type_cd: string
    data_len?: number | null
    data_scale?: number | null
    dom_desc?: string
  }

  if (
    !body.dom_nm?.trim() ||
    !body.key_dom_nm?.trim() ||
    !body.key_dom_phy_nm?.trim()
  ) {
    return apiError('ADM_STD_DOMAIN_FIELDS_REQUIRED', 400)
  }

  const { data, error } = await getSupabaseAdmin()
    .from('std_dom')
    .insert({
      dom_id: crypto.randomUUID(),
      dom_nm: body.dom_nm.trim(),
      key_dom_nm: body.key_dom_nm.trim(),
      key_dom_phy_nm: body.key_dom_phy_nm.trim().toUpperCase(),
      dom_type_cd: body.dom_type_cd ?? '0003',
      data_type_cd: body.data_type_cd ?? '0003',
      data_len: body.data_len ?? null,
      data_scale: body.data_scale ?? null,
      dom_desc: body.dom_desc?.trim() ?? null,
      regr_id: requester?.id ?? null,
    })
    .select()
    .single()

  if (error) return apiError('ADM_REGISTER_FAILED', 500)

  return NextResponse.json({ domain: data }, { status: 201 })
}
