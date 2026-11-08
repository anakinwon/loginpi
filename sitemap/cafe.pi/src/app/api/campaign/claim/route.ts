import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

const CAMPAIGN_CD = 'SHOP_ONBOARD'

// POST /api/campaign/claim — 대표 매장 1개 선택 후 신청 (1인 1회)
// body: { shop_id?: string }
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const body = (await req.json().catch(() => ({}))) as { shop_id?: string }
  const shopId =
    typeof body.shop_id === 'string' && body.shop_id ? body.shop_id : null

  const { data, error } = await getSupabaseAdmin().rpc(
    'fn_bean_campaign_grant',
    {
      p_usr_id: user.id,
      p_campaign_cd: CAMPAIGN_CD,
      p_shop_id: shopId,
    },
  )
  if (error) {
    console.error('[campaign/claim] 실패:', error.message)
    return apiError('CAMP_CLAIM_FAILED', 500)
  }

  return NextResponse.json(data)
}
