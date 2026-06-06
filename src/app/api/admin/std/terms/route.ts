import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')?.trim() ?? ''

  let query = getSupabaseAdmin()
    .from('std_term')
    .select('term_id, term_log_nm, term_phy_nm, term_phy_fll_nm, term_desc, apv_status, synced_at')
    .order('term_log_nm', { ascending: true })

  if (search) {
    const s = search.replace(/[%_\\]/g, '\\$&')
    query = query.or(`term_log_nm.ilike.%${s}%,term_phy_nm.ilike.%${s}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })

  return NextResponse.json({ terms: data })
}

export async function POST(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

  const body = (await req.json()) as {
    term_log_nm: string
    term_phy_nm: string
    term_phy_fll_nm?: string
    term_desc?: string
  }

  if (!body.term_log_nm?.trim() || !body.term_phy_nm?.trim()) {
    return NextResponse.json({ error: '논리명과 물리명은 필수입니다' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('std_term')
    .insert({
      term_log_nm: body.term_log_nm.trim(),
      term_phy_nm: body.term_phy_nm.trim().toLowerCase(),
      term_phy_fll_nm: body.term_phy_fll_nm?.trim().toUpperCase() ?? null,
      term_desc: body.term_desc?.trim() ?? null,
      apv_status: 'APPROVED',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: '등록 실패' }, { status: 500 })

  return NextResponse.json({ term: data }, { status: 201 })
}
