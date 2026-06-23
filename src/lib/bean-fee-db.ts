import 'server-only'
import { unstable_cache } from 'next/cache'
import { getSupabaseAdmin } from './supabase-admin'
import type { SubscrPlan, SubscrProduct, SubscrGrade, SubscrCycle } from './bean-subscr-plan'

// bean_fee_plan DB 행 → SubscrPlan 변환
// prod_ctgr_cd 형식: 'PICAFE_SUBSCR' → 'PICAFE', 'PISHOP_SUBSCR' → 'PISHOP', 'TRANSLATE_SUBSCR' → 'TRANSLATE'
function rowToPlan(row: {
  fee_plan_cd: string
  prod_ctgr_cd: string
  grade_cd: string
  bill_cycle_cd: string
  amt_bean: number
  qty_limit: number
}): SubscrPlan {
  return {
    fee_plan_cd: row.fee_plan_cd,
    product: row.prod_ctgr_cd.replace('_SUBSCR', '') as SubscrProduct,
    grade: row.grade_cd as SubscrGrade,
    cycle: row.bill_cycle_cd as SubscrCycle,
    bean_amt: row.amt_bean,
    item_limit: row.qty_limit,
  }
}

// bean_fee_plan에서 구독요금제(SUBSCR·use_yn=Y·del_yn=N) 조회 — 60초 캐시.
// 어드민 PATCH 후 revalidateTag('subscr-plans')으로 즉시 무효화.
export const getSubscrPlans = unstable_cache(
  async (): Promise<SubscrPlan[]> => {
    const { data, error } = await getSupabaseAdmin()
      .from('bean_fee_plan')
      .select(
        'fee_plan_cd, prod_ctgr_cd, grade_cd, bill_cycle_cd, amt_bean, qty_limit',
      )
      .eq('subscr_div_cd', 'SUBSCR')
      .eq('use_yn', 'Y')
      .eq('del_yn', 'N')
      .order('sort_ord', { ascending: true })

    if (error) {
      console.error('[bean-fee-db] getSubscrPlans 실패:', error.message)
      return []
    }
    return (data ?? []).map(rowToPlan)
  },
  ['subscr-plans'],
  { revalidate: 60, tags: ['subscr-plans'] },
)
