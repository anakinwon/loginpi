import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'
import {
  findPlan,
  cycleMonths,
  type SubscrProduct,
  type SubscrGrade,
  type SubscrCycle,
} from './bean-subscr-plan'

// 활성 구독 1건 (상품군별)
export interface ActiveSubscr {
  prod_ctgr_cd: SubscrProduct
  grade_cd: SubscrGrade
  bill_cycle_cd: SubscrCycle
  fee_plan_cd: string
  expire_dtm: string
  auto_renew_yn: string
}

// 내 활성 구독 목록 (만료 전 + 미삭제)
export async function getMySubscriptions(
  usrId: string,
): Promise<ActiveSubscr[]> {
  const { data } = await getSupabaseAdmin()
    .from('bean_subscr')
    .select(
      'prod_ctgr_cd, grade_cd, bill_cycle_cd, fee_plan_cd, expire_dtm, auto_renew_yn',
    )
    .eq('usr_id', usrId)
    .eq('del_yn', 'N')
    .gt('expire_dtm', new Date().toISOString())
  return (data as ActiveSubscr[] | null) ?? []
}

// 내 판매 상품 수 (PiShop 등급 추천용)
export async function getMyItemCount(usrId: string): Promise<number> {
  const { count } = await getSupabaseAdmin()
    .from('mps_item')
    .select('item_id', { count: 'exact', head: true })
    .eq('seller_id', usrId)
    .eq('del_yn', 'N')
  return count ?? 0
}

export type SubscribeResult =
  | { ok: true; balance: number; expire_dtm: string }
  | { ok: false; error: 'INSUFFICIENT_BEAN' | 'INVALID_PLAN' | 'ERROR' }

// 상품 구독 결제 — 금액·개월수는 서버(bean-subscr-plan.ts) 권위값. fn_bean_subscribe_product 원자 처리.
export async function subscribeProduct(args: {
  usrId: string
  product: SubscrProduct
  grade: SubscrGrade
  cycle: SubscrCycle
  regrId?: string
}): Promise<SubscribeResult> {
  const plan = findPlan(args.product, args.grade, args.cycle)
  if (!plan) return { ok: false, error: 'INVALID_PLAN' }

  const { data, error } = await getSupabaseAdmin().rpc(
    'fn_bean_subscribe_product',
    {
      p_usr_id: args.usrId,
      p_prod: args.product,
      p_grade: args.grade,
      p_cycle: args.cycle,
      p_fee_plan_cd: plan.fee_plan_cd,
      p_bean_amt: plan.bean_amt,
      p_months: cycleMonths(args.cycle),
      p_regr_id: args.regrId ?? 'ADMIN',
    },
  )

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('INSUFFICIENT_BEAN'))
      return { ok: false, error: 'INSUFFICIENT_BEAN' }
    if (msg.includes('INVALID_PLAN'))
      return { ok: false, error: 'INVALID_PLAN' }
    console.error('[구독] Bean 결제 실패:', msg)
    return { ok: false, error: 'ERROR' }
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { out_bal: number; out_expire: string }
    | undefined
  return {
    ok: true,
    balance: Number(row?.out_bal ?? 0),
    expire_dtm: row?.out_expire ?? '',
  }
}
