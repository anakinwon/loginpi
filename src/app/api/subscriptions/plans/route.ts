import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getChatPlan } from '@/lib/chat-auth'

export interface SubscrPlanRow {
  plan_cd: string
  plan_nm: string
  plan_desc: string | null
  plan_tp_cd: 'FREE' | 'PREMIUM' | 'BUSINESS'
  price_pi: number
  mth_cnt: number
}

// GET /api/subscriptions/plans — 전체 구독 플랜 목록 + 현재 사용자 등급.
// 비로그인 사용자는 current.plan_cd='FREE'.
export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from('msg_subscr_plan')
    .select('plan_cd, plan_nm, plan_desc, plan_tp_cd, price_pi, mth_cnt')
    .eq('use_yn', 'Y')
    .eq('del_yn', 'N')
    .order('price_pi', { ascending: true })

  if (error)
    return NextResponse.json({ error: '플랜 목록 조회 실패' }, { status: 500 })

  let current: {
    plan_cd: string
    expire_dtm: string | null
    auto_renew_yn: 'Y' | 'N' | null
  } = {
    plan_cd: 'FREE',
    expire_dtm: null,
    auto_renew_yn: null,
  }
  const user = await getSessionUser()
  if (user) {
    const plan = await getChatPlan(user.id)
    current = {
      plan_cd: plan.plan_cd,
      expire_dtm: plan.expire_dtm,
      auto_renew_yn: plan.auto_renew_yn,
    }
  }

  return NextResponse.json({ plans: (data ?? []) as SubscrPlanRow[], current })
}
