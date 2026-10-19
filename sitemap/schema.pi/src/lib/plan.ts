// 분류체계 요금제(서버 전용, sql/049) — 현재 요금제 = 기간 안(시작 ≤ 지금 < 종료) 행 중 가장 높은 요금제, 없으면 FREE. 가격은 sys_fee_plan
import 'server-only'
import { db } from './db'
import { PLANS, type PlanCd } from './roles'
import { upgradeFee, type UpgQuote, type UpgTerm } from './upgrade'

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

// 구독 중 = 결제한 요금제 사용 중(무료·유예 아님) — 이때는 업그레이드와 현재 요금제 선결제(만료일 뒤로 연장, sql/054)만 결제 가능(마스터 지시 2026-10-19)
export const subscribed = (p: AreaPlan) => p.plan !== 'FREE' && !p.grace

// 업그레이드 견적 — 현재 결제 요금제보다 높은 요금제(같은 요금제 월 → 연 포함)마다 일할계산 금액(src/lib/upgrade.ts). 무료·유예만 = 빈 목록
export async function upgradeQuotes(areaId: string, now = Date.now()): Promise<{ from: PlanCd; quotes: (UpgQuote & { plan_cd: PlanCd })[] }> {
  const cur = await areaPlan(areaId)
  if (cur.plan === 'FREE') return { from: cur.plan, quotes: [] }
  const [fees, terms] = await Promise.all([
    feePlans(),
    db().from('std_area_plan').select('prd_cd, strt_dtm, end_dtm, grnt_rsn_cd').eq('area_id', areaId).eq('plan_cd', cur.plan).eq('del_yn', 'N').gt('end_dtm', new Date(now).toISOString()),
  ])
  if (terms.error) throw terms.error
  const price = Object.fromEntries(fees.map((f) => [f.plan_cd + f.prd_cd, f.pi_amt]))
  // 같은·상위 요금제 × 새 주기(월·년 — 같은 요금제 월 → 연 외 불가한 조합은 upgradeFee 가 null)
  const quotes = PLANS.slice(PLANS.indexOf(cur.plan)).flatMap((to) =>
    (['M', 'Y'] as const).flatMap((prd) => {
      const q = upgradeFee((terms.data ?? []) as UpgTerm[], price, cur.plan, to, now, prd)
      return q ? [{ ...q, plan_cd: to }] : []
    }),
  )
  return { from: cur.plan, quotes }
}
