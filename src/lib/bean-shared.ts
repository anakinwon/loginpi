// Bean 토큰 이코노미 — 클라이언트·서버 공용 상수/타입 (server-only 아님)
// DB 접근 로직은 server-only인 '@/lib/bean'에 분리.

export const BEAN_PER_PI = 100

// 충전 프리셋 (Bean 단위 → Pi = bean / 100). 정수만.
export const CHARGE_PRESETS = [100, 500, 1000, 5000] as const

export type BeanTxnType = 'CHARGE' | 'SPEND' | 'REWARD' | 'REFUND'

export interface BeanTxn {
  txn_id: string
  txn_tp_cd: BeanTxnType
  bean_amt: number // 부호 있는 증감액
  bal_amt: number // 거래 직후 잔액
  pi_amt: number | null
  memo_txt: string | null
  reg_dtm: string
}

// Bean → Pi 환산 (정수 Bean ÷ 100). 결제 amount 계산용.
export const beanToPi = (bean: number): number => bean / BEAN_PER_PI
