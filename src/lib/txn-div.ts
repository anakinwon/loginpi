// 거래 구분 코드 (txn_div_cd) — 단일 소스
// pi_pymnt(U2A 결제)와 mps_txn_hist(취소·환불·수수료·정산)를 하나의 분류 체계로 통합한다.
// 라벨은 i18n 번역키(admin.payments.txnDiv.<code>), 이모지는 이 파일이 정본.

export type TxnDivCd =
  // ── 결제(pi_pymnt) 계열 ──
  | 'BEAN_CHARGE' // BEAN_CHARGE — Bean 충전(Pi 현금 유입)
  | 'PRODUCT_PAY' // MPS_ESCROW — 상품 결제(에스크로 입금)
  | 'BOND_DEPOSIT' // MPS_BOND — 판매 보증금 예치
  | 'SUBSCRIPTION' // CHAT_SUBSCR — 구독(레거시 — 2026-06-21 Bean 전환으로 신규 발행 없음)
  | 'ROOM_CREATE' // CHAT_ROOM_CREATE — 채팅방 생성(레거시)
  | 'TIP' // PI_TIP — 팁(레거시)
  | 'ETC' // 미분류(metadata.type 없음/미등록)
  // ── 취소·정산(mps_txn_hist) 계열 ──
  | 'REFUND' // REFUND_IN — 취소 환불(구매자 지급)
  | 'CANCEL_FEE' // FEE — 취소수수료(차감)
  | 'CANCEL_FEE_RECV' // CANCEL_FEE_IN — 취소수수료 수령(보상)
  | 'SETTLEMENT' // RELEASE_OUT — 판매자 정산 출금

// 필터칩 표시 순서 (결제 계열 → 취소·정산 계열)
export const TXN_DIV_CODES: TxnDivCd[] = [
  'BEAN_CHARGE',
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
  BEAN_CHARGE: '⚡',
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
  'BEAN_CHARGE',
  'PRODUCT_PAY',
  'BOND_DEPOSIT',
  'SUBSCRIPTION',
  'ROOM_CREATE',
  'TIP',
  'ETC',
])
export const isPaymentDiv = (cd: TxnDivCd): boolean => PAYMENT_DIVS.has(cd)

// ─────────────────────────────────────────────────────────────────────
// pi_pymnt metadata.type → 거래구분 매핑
//
// ⚠️ 재발방지(2026-06-22): 신규 결제 타입을 추가할 때 거래구분 등록을 빠뜨려
//   "❓ 기타"로 잘못 분류되던 사고(BEAN_CHARGE)를 원천 차단한다.
//   - 현재 활성 결제 타입은 ACTIVE_PYMNT_DIV(Record)로 관리 → 발행 지점은
//     ActivePymntType을 import해 사용하고, 새 타입을 union에 추가하면 이 Record를
//     채우지 않는 한 **컴파일이 실패**하므로 매핑 누락이 불가능하다.
//   - default 흡수(switch)를 제거해, 미등록 타입이 조용히 ETC로 빠지는 일을 막는다.
// ─────────────────────────────────────────────────────────────────────

// 현재 발행되는 활성 Pi 결제 타입 (2026-06-21 Bean 전환 후 3종).
// 결제 발행 지점(bean/charge·store/bond·store/orders[/cart])은 이 타입을 사용한다.
export type ActivePymntType = 'BEAN_CHARGE' | 'MPS_ESCROW' | 'MPS_BOND'

// 활성 타입 → 거래구분. Record라 ActivePymntType에 값을 추가하면 매핑 강제.
const ACTIVE_PYMNT_DIV: Record<ActivePymntType, TxnDivCd> = {
  BEAN_CHARGE: 'BEAN_CHARGE',
  MPS_ESCROW: 'PRODUCT_PAY',
  MPS_BOND: 'BOND_DEPOSIT',
}

// 레거시 타입 → 거래구분 (2026-06-21 이전 발행분, 과거 결제내역 표시 전용 — 신규 발행 없음).
const LEGACY_PYMNT_DIV: Record<string, TxnDivCd> = {
  CHAT_SUBSCR: 'SUBSCRIPTION',
  CHAT_ROOM_CREATE: 'ROOM_CREATE',
  PI_TIP: 'TIP',
}

export function pymntTypeToDiv(type: string | null | undefined): TxnDivCd {
  if (type && type in ACTIVE_PYMNT_DIV) {
    return ACTIVE_PYMNT_DIV[type as ActivePymntType]
  }
  return LEGACY_PYMNT_DIV[type ?? ''] ?? 'ETC'
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
