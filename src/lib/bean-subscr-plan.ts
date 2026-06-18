// 구독 상품 단일 소스 — bean_fee_plan §4-1(구독요금제) 미러. (옆집 bean-fee.ts와 동일 원칙: 코드 단일 소스)
// 출처: docs/PRD_15_FEE.md §4-1 / docs/PRD_14_SUBSC_REDESIGN.md
//   - 상품군별 독립 구독(PiCafe·PiStore S/M/L·자동번역), 구독료 = Bean 차감(SPEND).
//   - 1 Pi = 100 Bean 고정. Bean 정수. 발행 전 오프체인 잔액 차감.
//   - 클라이언트·서버 공용(server-only 아님). DB 접근은 '@/lib/bean-subscr'.

export type SubscrProduct = 'PICAFE' | 'PISTORE' | 'TRANSLATE'
export type SubscrCycle = 'M' | 'Y'
export type SubscrGrade = 'GENERAL' | 'S' | 'M' | 'L'

export interface SubscrPlan {
  fee_plan_cd: string // bean_fee_plan 코드 (SM100 등)
  product: SubscrProduct
  grade: SubscrGrade
  cycle: SubscrCycle
  bean_amt: number // 구독료(Bean)
  item_limit: number // PiStore 상품 수 한도 (0 = 무제한/해당없음)
}

// bean_fee_plan §4-1 구독요금제 10행 미러 (정수 Bean)
export const SUBSCR_PLANS: SubscrPlan[] = [
  { fee_plan_cd: 'SM100', product: 'PICAFE', grade: 'GENERAL', cycle: 'M', bean_amt: 3000, item_limit: 0 },
  { fee_plan_cd: 'SY100', product: 'PICAFE', grade: 'GENERAL', cycle: 'Y', bean_amt: 30000, item_limit: 0 },
  { fee_plan_cd: 'SM200', product: 'PISTORE', grade: 'S', cycle: 'M', bean_amt: 3000, item_limit: 30 },
  { fee_plan_cd: 'SM300', product: 'PISTORE', grade: 'M', cycle: 'M', bean_amt: 4000, item_limit: 50 },
  { fee_plan_cd: 'SM400', product: 'PISTORE', grade: 'L', cycle: 'M', bean_amt: 5000, item_limit: 0 },
  { fee_plan_cd: 'SY200', product: 'PISTORE', grade: 'S', cycle: 'Y', bean_amt: 30000, item_limit: 30 },
  { fee_plan_cd: 'SY300', product: 'PISTORE', grade: 'M', cycle: 'Y', bean_amt: 40000, item_limit: 50 },
  { fee_plan_cd: 'SY400', product: 'PISTORE', grade: 'L', cycle: 'Y', bean_amt: 50000, item_limit: 0 },
  { fee_plan_cd: 'SM500', product: 'TRANSLATE', grade: 'GENERAL', cycle: 'M', bean_amt: 1000, item_limit: 0 },
  { fee_plan_cd: 'SY500', product: 'TRANSLATE', grade: 'GENERAL', cycle: 'Y', bean_amt: 10000, item_limit: 0 },
]

export const SUBSCR_PRODUCTS: SubscrProduct[] = ['PICAFE', 'PISTORE', 'TRANSLATE']

// 주기 → 개월 수 (M=1, Y=12). 연간은 월×10 가격 = 2개월 무료.
export const cycleMonths = (cycle: SubscrCycle): number => (cycle === 'Y' ? 12 : 1)

// (product, grade, cycle)로 요금 1행 선택 — 서버 권위 조회.
export function findPlan(
  product: SubscrProduct,
  grade: SubscrGrade,
  cycle: SubscrCycle,
): SubscrPlan | undefined {
  return SUBSCR_PLANS.find(
    (p) => p.product === product && p.grade === grade && p.cycle === cycle,
  )
}

// PiStore 등급 자동 추천 (현재 상품 수 기준): 30개↓ S · 50개↓ M · 초과 L
export function recommendStoreGrade(itemCount: number): SubscrGrade {
  if (itemCount <= 30) return 'S'
  if (itemCount <= 50) return 'M'
  return 'L'
}
