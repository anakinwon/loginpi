// 분류체계 요금제(서버 전용, sql/049) — 현재 요금제 = 기간 안(시작 ≤ 지금 < 종료) 행 중 가장 높은 요금제, 없으면 FREE. 가격은 sys_fee_plan
import 'server-only'
import { db } from './db'
import { PLANS, type PlanCd } from './roles'

export interface AreaPlan {
  plan: PlanCd
  end: string | null // 현재 요금제 종료일시(FREE = null)
  grace: boolean // 유예 기간(결제 아님)
}

export async function areaPlan(areaId: string): Promise<AreaPlan> {
  const now = new Date().toISOString()
  const { data, error } = await db()
    .from('std_area_plan')
    .select('plan_cd, end_dtm, grnt_rsn_cd')
    .eq('area_id', areaId)
    .eq('del_yn', 'N')
    .lte('strt_dtm', now)
    .gt('end_dtm', now)
  if (error) throw error
  let best: AreaPlan = { plan: 'FREE', end: null, grace: false }
  for (const r of data ?? []) {
    const p = r.plan_cd as PlanCd
    // 높은 요금제 우선, 같은 요금제면 늦게 끝나는 기간
    if (PLANS.indexOf(p) > PLANS.indexOf(best.plan) || (p === best.plan && r.end_dtm > (best.end ?? ''))) best = { plan: p, end: r.end_dtm, grace: r.grnt_rsn_cd === 'GRACE' }
  }
  return best
}

export interface FeePlan {
  plan_cd: PlanCd
  prd_cd: 'M' | 'Y'
  plan_nm: string
  pi_amt: number
  use_mon_cnt: number
}

export async function feePlans(): Promise<FeePlan[]> {
  const { data, error } = await db().from('sys_fee_plan').select('plan_cd, prd_cd, plan_nm, pi_amt, use_mon_cnt').eq('use_yn', 'Y').eq('del_yn', 'N').order('sort_seq')
  if (error) throw error
  return (data ?? []).map((r) => ({ ...r, pi_amt: Number(r.pi_amt) }) as FeePlan)
}
