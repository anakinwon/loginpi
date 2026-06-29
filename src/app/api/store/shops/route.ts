import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { listMyShops } from '@/lib/mps-shop'

// GET /api/store/shops — 내 매장 목록 (판매자 인증, FR-06)
//   ?all=1 — 관리자 전체 매장 (그 외 본인 매장만)
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const wantAll = req.nextUrl.searchParams.get('all') === '1' && isAdmin(user)
  const [shops, userRes] = await Promise.all([
    listMyShops(wantAll ? null : user.id),
    getSupabaseAdmin()
      .from('sys_user')
      .select('rep_shop_id')
      .eq('id', user.id)
      .maybeSingle(),
  ])
  const repShopId =
    (userRes.data as { rep_shop_id?: string | null } | null)?.rep_shop_id ??
    null
  return NextResponse.json({ shops, rep_shop_id: repShopId })
}

// POST /api/store/shops — 자유 매장 등록 폐기 (2026-06-25)
// 매장은 오프라인 + 구글맵 검증(claim)만 허용한다.
//   → 구글맵 미등록 매장은 검증 불가, 타인 매장 무단 등록은 불법.
//   정식 등록 경로: 지도(/map)에서 내 매장 찾기 → POST /api/store/shops/claim
export async function POST() {
  return NextResponse.json(
    {
      error:
        '매장은 구글맵 인증 등록으로만 가능합니다. 지도에서 내 매장을 찾아 인증 등록해 주세요.',
    },
    { status: 403 },
  )
}
