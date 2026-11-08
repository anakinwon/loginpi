import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

// 상품군 코드 → 표시명 (prod_ctgr_cd: PICAFE / PISHOP / PISHOP_SUBSCR / TRANSLATE)
const PROD_NM: Record<string, string> = {
  PICAFE: 'PyCafé™ 구독',
  PISHOP: 'PyShop™ 구독',
  PISHOP_SUBSCR: 'PyShop™ 구독',
  TRANSLATE: 'PyTranslate™ 구독',
}

// GET /api/subscriptions/list — 사용자의 활성 구독 전체 목록 (프로필 구독현황 표시용).
// getChatPlan(채팅 권한 판정용 단일 플랜, PICAFE/TRANSLATE만)과 달리,
// 모든 상품군(PICAFE/PISHOP/TRANSLATE)의 활성 구독을 빠짐없이 반환한다.
// (버그: 구독현황이 getChatPlan을 재사용해 2개 구독 중 1개만 보이던 문제 해결)
export async function GET() {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const { data, error } = await getSupabaseAdmin()
    .from('bean_subscr')
    .select(
      'subscr_id, prod_ctgr_cd, fee_plan_cd, bean_amt, start_dtm, expire_dtm, auto_renew_yn',
    )
    .eq('usr_id', user.id)
    .eq('del_yn', 'N')
    .gt('expire_dtm', new Date().toISOString()) // 만료 구독 제외
    .order('expire_dtm', { ascending: false })

  if (error) return apiError('SUBSCR_LIST_QUERY_FAILED', 500)

  type Row = {
    subscr_id: string
    prod_ctgr_cd: string
    fee_plan_cd: string
    bean_amt: number
    start_dtm: string
    expire_dtm: string
    auto_renew_yn: 'Y' | 'N'
  }
  const subscriptions = ((data ?? []) as Row[]).map((s) => ({
    subscr_id: s.subscr_id,
    prod_ctgr_cd: s.prod_ctgr_cd,
    plan_nm: PROD_NM[s.prod_ctgr_cd] ?? s.prod_ctgr_cd,
    fee_plan_cd: s.fee_plan_cd,
    bean_amt: s.bean_amt,
    start_dtm: s.start_dtm,
    expire_dtm: s.expire_dtm,
    auto_renew_yn: s.auto_renew_yn,
  }))

  return NextResponse.json({ subscriptions })
}
