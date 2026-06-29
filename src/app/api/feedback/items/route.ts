import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

interface CtgrItemRow {
  item_cd: string
  item_nm: string
  item_desc: string | null
}

// GET /api/feedback/items?ctgr_id=<uuid>
// 카테고리별 이용후기 평가 항목 목록 반환 (인증 불필요 — 공개 정보)
//
// 우선순위 (사용자 요구: "카테고리에 직접 등록한 것 우선"):
//   1. 요청 카테고리에 직접 등록된 항목이 있으면 → 그것 반환 (self)
//   2. 없으면 → 부모 카테고리의 항목으로 fallback (parent, 기본 세트)
//   3. 그것도 없으면 → 빈 배열
export async function GET(req: NextRequest) {
  const ctgrId = req.nextUrl.searchParams.get('ctgr_id')
  if (!ctgrId) {
    return NextResponse.json({ error: 'ctgr_id가 필요합니다' }, { status: 400 })
  }

  const db = getSupabaseAdmin()

  // 1. 요청 카테고리에 직접 등록된 항목 (최우선)
  const { data: direct, error: directErr } = await db
    .from('fbck_ctgr_item')
    .select('item_cd, item_nm, item_desc')
    .eq('ctgr_id', ctgrId)
    .eq('del_yn', 'N')
    .order('sort_ord', { ascending: true })

  if (directErr) {
    return NextResponse.json({ error: '항목 조회 실패' }, { status: 500 })
  }
  if (direct && direct.length > 0) {
    return NextResponse.json({ items: direct as CtgrItemRow[], source: 'self' })
  }

  // 2. 직접 등록이 없으면 부모 카테고리로 fallback (기본 항목 세트)
  const { data: ctgr } = await db
    .from('mps_ctgr')
    .select('parent_ctgr_id')
    .eq('ctgr_id', ctgrId)
    .eq('del_yn', 'N')
    .maybeSingle()

  const parentId = (ctgr as { parent_ctgr_id: string | null } | null)
    ?.parent_ctgr_id
  if (parentId) {
    const { data: parent } = await db
      .from('fbck_ctgr_item')
      .select('item_cd, item_nm, item_desc')
      .eq('ctgr_id', parentId)
      .eq('del_yn', 'N')
      .order('sort_ord', { ascending: true })

    if (parent && parent.length > 0) {
      return NextResponse.json({
        items: parent as CtgrItemRow[],
        source: 'parent',
      })
    }
  }

  // 3. 직접·부모 모두 없음
  return NextResponse.json({ items: [], source: 'none' })
}
