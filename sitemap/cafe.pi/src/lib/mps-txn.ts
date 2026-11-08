import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

// MPS 거래 내역 (FR-12) — mps_txn_hist를 상품명·주문상태와 함께 조회
// 거래 이력은 사용자별 행(user_id)으로 기록됨: ESCROW_IN(구매자 입금)·RELEASE_OUT(판매자 정산) 등

export interface TxnHistRow {
  txn_id: string
  order_id: string
  txn_type_cd: string
  pi_amt: number
  txn_dtm: string
  memo: string | null
  item_nm: string | null
  order_st_cd: string | null
}

export interface TxnFilter {
  from?: string // ISO 날짜 (txn_dtm >=)
  to?: string // ISO 날짜 (txn_dtm <=)
  limit?: number
}

// 거래 이력 유형 → 카테고리(구매/판매/기타) — UI 탭 필터용
export type TxnCategory = 'BUY' | 'SELL' | 'ETC'
const BUY_TYPES = new Set(['ESCROW_IN', 'CANCEL_REFUND', 'REFUND_IN'])
const SELL_TYPES = new Set(['RELEASE_OUT', 'CANCEL_FEE_IN', 'SETTLE_OUT'])

export function txnCategory(typeCd: string): TxnCategory {
  if (BUY_TYPES.has(typeCd)) return 'BUY'
  if (SELL_TYPES.has(typeCd)) return 'SELL'
  return 'ETC'
}

// 내 거래 내역 — 상품명·주문상태 조인. userId가 비면 전체(관리자용)
export async function listTxns(
  userId: string | null,
  filter: TxnFilter = {},
): Promise<TxnHistRow[]> {
  let q = getSupabaseAdmin()
    .from('mps_txn_hist')
    .select(
      'txn_id, order_id, txn_type_cd, pi_amt, txn_dtm, memo, mps_order(order_st_cd, mps_item(item_nm))',
    )
    .eq('del_yn', 'N')
    .order('txn_dtm', { ascending: false })
    .limit(filter.limit ?? 100)

  if (userId) q = q.eq('user_id', userId)
  if (filter.from) q = q.gte('txn_dtm', filter.from)
  if (filter.to) q = q.lte('txn_dtm', filter.to)

  const { data, error } = await q
  if (error) throw new Error(error.message)

  type Joined = {
    txn_id: string
    order_id: string
    txn_type_cd: string
    pi_amt: number
    txn_dtm: string
    memo: string | null
    mps_order: {
      order_st_cd: string | null
      mps_item: { item_nm: string | null } | null
    } | null
  }

  return ((data ?? []) as unknown as Joined[]).map((r) => ({
    txn_id: r.txn_id,
    order_id: r.order_id,
    txn_type_cd: r.txn_type_cd,
    pi_amt: Number(r.pi_amt),
    txn_dtm: r.txn_dtm,
    memo: r.memo,
    item_nm: r.mps_order?.mps_item?.item_nm ?? null,
    order_st_cd: r.mps_order?.order_st_cd ?? null,
  }))
}
