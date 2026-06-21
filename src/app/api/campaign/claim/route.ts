import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const CAMPAIGN_CD = 'SHOP_ONBOARD'

// POST /api/campaign/claim — 매장 온보딩 보상 청구(자격검사+선착순+멱등 지급, 원자적 RPC)
export async function POST() {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { data, error } = await getSupabaseAdmin().rpc(
    'fn_bean_campaign_grant',
    { p_usr_id: user.id, p_campaign_cd: CAMPAIGN_CD },
  )
  if (error) {
    console.error('[campaign/claim] 실패:', error.message)
    return NextResponse.json({ error: '보상 처리 실패' }, { status: 500 })
  }

  // data.status: GRANTED / ALREADY_GRANTED / SOLD_OUT / NOT_ELIGIBLE / INSUFFICIENT_POOL / NOT_ACTIVE / NO_CAMPAIGN
  return NextResponse.json(data)
}
