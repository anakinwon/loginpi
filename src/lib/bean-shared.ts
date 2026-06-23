// Bean 토큰 이코노미 — 클라이언트·서버 공용 상수/타입 (server-only 아님)
// DB 접근 로직은 server-only인 '@/lib/bean'에 분리.

export const BEAN_PER_PI = 100

// 충전 프리셋 (Bean 단위 → Pi = bean / 100). 정수만.
export const CHARGE_PRESETS = [100, 500, 1000, 5000] as const

// 카페방 P2P 선물 프리셋 (Bean 단위). 1 Pi = 100 Bean → 100/500/1000 Bean = 1/5/10 Pi.
export const TIP_PRESETS_BEAN = [100, 500, 1000] as const

// TRANSFER: 카페방 P2P 선물(USER↔USER 이전, 부호로 송수신 구분)
export type BeanTxnType = 'CHARGE' | 'SPEND' | 'REWARD' | 'REFUND' | 'TRANSFER'

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

// 이벤트방 입장료 환산 — 호스트 지정 entry_fee_pi(Pi 표시값) → Bean.
// 이벤트방은 '호스트 지정 티켓가'라 등급 정액(EVENT 20)이 아닌 지정가를 그대로 Bean으로 받는다.
// (구독 할인 없음 — 기존 Pi 결제와 동일하게 전원 동일 입장료. 1 Pi = 100 Bean 고정·정수)
export const eventEntryFeeBean = (
  entryFeePi: number | null | undefined,
): number => Math.round((entryFeePi ?? 0) * BEAN_PER_PI)
