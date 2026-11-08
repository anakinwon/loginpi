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

  const bond = data as Pick<
    SellerBond,
    'bond_bal_pi' | 'rsv_pi' | 'cancel_cnt'
  > | null
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

// 보상 지급 결과 — DB 함수 fn_evt_grant_bond_reward의 반환값
export type BondRewardResult =
  | 'GRANTED' // 신규 지급 완료
  | 'ALREADY' // 이미 지급(BONDED/PAID) — 중복 차단됨
  | 'NOT_ELIGIBLE' // 미션 미완료
  | 'NO_EVENT' // 이벤트 없음
  | 'ERROR' // RPC 오류

/**
 * 이벤트 미션 완료 보상 — 판매보증금 1π 직접 적립 (Pi 송금 없음)
 *
 * 중복 지급 방지: DB 함수 fn_evt_grant_bond_reward(sql/061)에 위임하여
 * 단일 트랜잭션 + FOR UPDATE 행 잠금 + reward_st_cd('BONDED'/'PAID') 게이트로
 * 원자적 처리한다. 앱 레벨 check-then-act의 TOCTOU race를 원천 차단.
 *   - GRANTED: 보상 로그 BONDED 기록 + mps_seller_bond 1π/0.1π 적립 (둘 다 또는 둘 다 롤백)
 *   - ALREADY: 이미 지급된 사용자 — 보증금 변동 없음
 */
export async function grantBondReward(
  eventId: string,
  userId: string,
): Promise<BondRewardResult> {
  const { data, error } = await getSupabaseAdmin().rpc(
    'fn_evt_grant_bond_reward',
    { p_event_id: eventId, p_user_id: userId },
  )

  if (error) {
    console.error(
      `[이벤트 보증금] 보상 지급 실패 event=${eventId} user=${userId}:`,
      error.message,
    )
    return 'ERROR'
  }

  const result = (data as BondRewardResult) ?? 'ERROR'
  if (result === 'GRANTED') {
    console.info(
      `[이벤트 보증금] 1π 적립 완료 — event=${eventId} user=${userId}`,
    )
  }
  return result
}

// 예치 처리 — Pi 결제 완료 콜백(MPS_BOND)에서 호출. 원자적 UPSERT는 DB RPC 위임
export async function depositBond(
  sellerId: string,
  pymntId: string,
  regrId: string,
) {
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
