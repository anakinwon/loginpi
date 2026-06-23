// 구독 상품 타입 + 순수 유틸리티 함수 — 클라이언트·서버 공용.
// 실제 요금 데이터는 bean_fee_plan DB 에서 읽는다 (서버: bean-fee-db.ts).
// 1 Pi = 100 Bean 고정. Bean 정수.

export type SubscrProduct = 'PICAFE' | 'PISHOP' | 'TRANSLATE'
export type SubscrCycle = 'M' | 'Y'
export type SubscrGrade = 'GENERAL' | 'S' | 'M' | 'L'

export interface SubscrPlan {
  fee_plan_cd: string
  product: SubscrProduct
  grade: SubscrGrade
  cycle: SubscrCycle
  bean_amt: number
  item_limit: number // 0 = 무제한/해당없음
}

export const SUBSCR_PRODUCTS: SubscrProduct[] = ['PICAFE', 'PISHOP', 'TRANSLATE']

// 주기 → 개월 수. 연간(Y)은 월×10 요금 = 2개월 무료.
export const cycleMonths = (cycle: SubscrCycle): number =>
  cycle === 'Y' ? 12 : 1

// 플랜 배열에서 (product, grade, cycle) 1행 선택.
export function findPlan(
  plans: SubscrPlan[],
  product: SubscrProduct,
  grade: SubscrGrade,
  cycle: SubscrCycle,
): SubscrPlan | undefined {
  return plans.find(
    (p) => p.product === product && p.grade === grade && p.cycle === cycle,
  )
}

// 연간 절약 계산 (월×12 − 연간). 연간이 없거나 절약 0 이하면 null.
export function annualSaving(
  plans: SubscrPlan[],
  product: SubscrProduct,
  grade: SubscrGrade,
): { saveBean: number; pct: number; monthsFree: number } | null {
  const m = findPlan(plans, product, grade, 'M')
  const y = findPlan(plans, product, grade, 'Y')
  if (!m || !y || m.bean_amt <= 0) return null
  const full = m.bean_amt * 12
  const saveBean = full - y.bean_amt
  if (saveBean <= 0) return null
  return {
    saveBean,
    pct: Math.round((saveBean / full) * 100),
    monthsFree: Math.round(saveBean / m.bean_amt),
  }
}
