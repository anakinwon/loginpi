// MPS 상품 거래 상태 도출 — 목록·상세 공용 (클라이언트 안전)
// OPEN(판매중): 판매 게시 중이고 거래중 수량을 뺀 재고가 남아있음 → 구매 가능
// TRADING(거래중): 재고는 소진됐지만 진행 중 주문이 남아있음 (취소 시 재고 복원 가능)
// SOLD(판매완료): 재고 소진 + 모든 거래 종결

export type TradeStatus = 'OPEN' | 'TRADING' | 'SOLD'

export interface TradeStatusInput {
  item_st_cd: string
  stock_qty: number
  trading_cnt: number
}

export function deriveTradeStatus(item: TradeStatusInput): TradeStatus {
  if (item.item_st_cd === 'OPEN' && item.stock_qty > 0) return 'OPEN'
  return item.trading_cnt > 0 ? 'TRADING' : 'SOLD'
}

// 구매 가능 여부 — 판매중(OPEN)이면서 거래중 수량을 제외한 재고가 존재할 때만
export function canPurchase(item: TradeStatusInput): boolean {
  return item.item_st_cd === 'OPEN' && item.stock_qty > 0
}

// 상태별 배지 색상 (Tailwind)
export const TRADE_ST_STYLE: Record<TradeStatus, string> = {
  OPEN: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  TRADING:
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  SOLD: 'bg-muted text-muted-foreground',
}
