import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/feedback/items?ctgr_id=<uuid>
// 카테고리별 이용후기 평가 항목 목록 반환 (인증 불필요 — 공개 정보)
export async function GET(req: NextRequest) {
  const ctgrId = req.nextUrl.searchParams.get('ctgr_id')
  if (!ctgrId) {
    return NextResponse.json({ error: 'ctgr_id가 필요합니다' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('fbck_ctgr_item')
    .select('item_cd, item_nm, item_desc')
    .eq('ctgr_id', ctgrId)
    .eq('del_yn', 'N')
    .order('sort_ord', { ascending: true })

  if (error) return NextResponse.json({ error: '항목 조회 실패' }, { status: 500 })

  return NextResponse.json({ items: data ?? [] })
}
