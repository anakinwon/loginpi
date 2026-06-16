// 거래 구분 코드 (txn_div_cd) — 단일 소스
// pi_pymnt(U2A 결제)와 mps_txn_hist(취소·환불·수수료·정산)를 하나의 분류 체계로 통합한다.
// 라벨은 i18n 번역키(admin.payments.txnDiv.<code>), 이모지는 이 파일이 정본.

export type TxnDivCd =
  // ── 결제(pi_pymnt) 계열 ──
  | 'PRODUCT_PAY' // MPS_ESCROW — 상품 결제(에스크로 입금)
  | 'BOND_DEPOSIT' // MPS_BOND — 판매 보증금 예치
  | 'SUBSCRIPTION' // CHAT_SUBSCR — 구독
  | 'ROOM_CREATE' // CHAT_ROOM_CREATE — 채팅방 생성
  | 'TIP' // PI_TIP — 팁
  | 'ETC' // 미분류(metadata.type 없음)
  // ── 취소·정산(mps_txn_hist) 계열 ──
  | 'REFUND' // REFUND_IN — 취소 환불(구매자 지급)
  | 'CANCEL_FEE' // FEE — 취소수수료(차감)
  | 'CANCEL_FEE_RECV' // CANCEL_FEE_IN — 취소수수료 수령(보상)
  | 'SETTLEMENT' // RELEASE_OUT — 판매자 정산 출금

// 필터칩 표시 순서 (결제 계열 → 취소·정산 계열)
export const TXN_DIV_CODES: TxnDivCd[] = [
  'PRODUCT_PAY',
  'BOND_DEPOSIT',
  'SUBSCRIPTION',
  'ROOM_CREATE',
  'TIP',
  'ETC',
  'REFUND',
  'CANCEL_FEE',
  'CANCEL_FEE_RECV',
  'SETTLEMENT',
]

export const TXN_DIV_EMOJI: Record<TxnDivCd, string> = {
  PRODUCT_PAY: '🛒',
  BOND_DEPOSIT: '🔒',
  SUBSCRIPTION: '💳',
  ROOM_CREATE: '🏠',
  TIP: '🎁',
  ETC: '❓',
  REFUND: '↩️',
  CANCEL_FEE: '✂️',
  CANCEL_FEE_RECV: '💰',
  SETTLEMENT: '🏦',
}

// 결제 계열 여부 — 총매출 합산은 결제 계열만 포함(환불·수수료 제외)
const PAYMENT_DIVS = new Set<TxnDivCd>([
  'PRODUCT_PAY',
  'BOND_DEPOSIT',
  'SUBSCRIPTION',
  'ROOM_CREATE',
  'TIP',
  'ETC',
])
export const isPaymentDiv = (cd: TxnDivCd): boolean => PAYMENT_DIVS.has(cd)

// pi_pymnt metadata.type → 거래구분
export function pymntTypeToDiv(type: string | null | undefined): TxnDivCd {
  switch (type) {
    case 'MPS_ESCROW':
      return 'PRODUCT_PAY'
    case 'MPS_BOND':
      return 'BOND_DEPOSIT'
    case 'CHAT_SUBSCR':
      return 'SUBSCRIPTION'
    case 'CHAT_ROOM_CREATE':
      return 'ROOM_CREATE'
    case 'PI_TIP':
      return 'TIP'
    default:
      return 'ETC'
  }
}

// mps_txn_hist txn_type_cd → 거래구분 (ESCROW_IN은 pi_pymnt와 중복이라 null=제외)
export function mpsTxnToDiv(txnType: string): TxnDivCd | null {
  switch (txnType) {
    case 'REFUND_IN':
      return 'REFUND'
    case 'FEE':
      return 'CANCEL_FEE'
    case 'CANCEL_FEE_IN':
      return 'CANCEL_FEE_RECV'
    case 'RELEASE_OUT':
      return 'SETTLEMENT'
    default:
      return null // ESCROW_IN, AUTO_RELEASE 등 결제 중복/대상 외
  }
}
