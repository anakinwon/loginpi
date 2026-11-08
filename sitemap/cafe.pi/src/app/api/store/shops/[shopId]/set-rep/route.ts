import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

// POST /api/store/shops/[shopId]/set-rep — 대표 매장 지정
// 소유권 확인 후 sys_user.rep_shop_id 업데이트
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> },
) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const { shopId } = await params
  const db = getSupabaseAdmin()

  // 소유권 확인
  const { data: shop } = await db
    .from('mps_shop')
    .select('shop_id')
    .eq('shop_id', shopId)
    .eq('seller_id', user.id)
    .eq('del_yn', 'N')
    .maybeSingle()

  if (!shop) return apiError('STORE_SHOP_NOT_OWNED', 404)

  const { error } = await db
    .from('sys_user')
    .update({
      rep_shop_id: shopId,
      modr_id: user.id,
      mod_dtm: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) {
    console.error('[set-rep] 실패:', error.message)
    return apiError('STORE_SET_REP_FAILED', 500)
  }

  return NextResponse.json({ ok: true, rep_shop_id: shopId })
}
