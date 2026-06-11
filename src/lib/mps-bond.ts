import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

// MPS 판매자 보증금 — PRD v1.4~v1.8 (1π 예치 · 0.1π×9회 충당 · 지급준비금 0.1π)
// 반환(환불) 기능은 §12 #9 법적 자문 완료 전 미구현

export const BOND_DEPOSIT_PI = 1
export const CANCEL_FEE_PI = 0.1
export const RESERVE_PI = 0.1 // 예치 1회당 지급준비금

export interface SellerBond {
  bond_id: string
  seller_id: string
  bond_bal_pi: number
  rsv_pi: number
  cancel_cnt: number
  mod_dtm: string
}

export interface BondStatus {
  deposited: boolean // 예치 이력 존재
  bonded: boolean // 보증금 활성 (가용 잔액 ≥ 0.1π) — 수수료 수령·부담 자격
  bond_bal_pi: number // 현재 잔액 (지급준비금 포함)
  avail_pi: number // 가용 수수료 잔액 (= 잔액 - 지급준비금)
  rsv_pi: number // 지급준비금 누계
  cancel_cnt: number // 누적 취소 차감 횟수
  remain_cancels: number // 잔여 감당 가능 취소 횟수
}

export async function getBondStatus(sellerId: string): Promise<BondStatus> {
  const { data } = await getSupabaseAdmin()
    .from('mps_seller_bond')
    .select('bond_bal_pi, rsv_pi, cancel_cnt')
    .eq('seller_id', sellerId)
    .eq('del_yn', 'N')
    .maybeSingle()

  const bond = data as Pick<SellerBond, 'bond_bal_pi' | 'rsv_pi' | 'cancel_cnt'> | null
  const bal = Number(bond?.bond_bal_pi ?? 0)
  const rsv = Number(bond?.rsv_pi ?? 0)
  const avail = Math.max(bal - rsv, 0)

  return {
    deposited: bond !== null,
    bonded: avail >= CANCEL_FEE_PI,
    bond_bal_pi: bal,
    avail_pi: avail,
    rsv_pi: rsv,
    cancel_cnt: bond?.cancel_cnt ?? 0,
    remain_cancels: Math.floor(avail / CANCEL_FEE_PI + 1e-9),
  }
}

// 상품 상세 등에서 "보증금 거래" 배지 표시용 — 활성 여부만
export async function isSellerBonded(sellerId: string): Promise<boolean> {
  const status = await getBondStatus(sellerId)
  return status.bonded
}

// 예치 처리 — Pi 결제 완료 콜백(MPS_BOND)에서 호출. 원자적 UPSERT는 DB RPC 위임
export async function depositBond(sellerId: string, pymntId: string, regrId: string) {
  const { data, error } = await getSupabaseAdmin().rpc('fn_mps_bond_deposit', {
    p_seller_id: sellerId,
    p_pymnt_id: pymntId,
    p_regr_id: regrId,
  })
  if (error) {
    console.error('보증금 예치 처리 실패:', error.message)
    return null
  }
  return data as SellerBond
}
