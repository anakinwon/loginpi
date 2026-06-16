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

/**
 * 이벤트 미션 완료 보상 — Pi 송금 없이 보증금 잔액에 1π 직접 적립
 *
 * 멱등 보장: evt_pi_reward_log UNIQUE(event_id, user_id) + reward_st_cd='BONDED'
 *   - BONDED → 즉시 skip (중복 적립 방지)
 *   - 기존 mps_seller_bond 있으면 잔액+1 / 없으면 신규 계좌 생성
 */
export async function grantBondReward(
  eventId: string,
  userId: string,
): Promise<void> {
  const db = getSupabaseAdmin()
  const now = new Date().toISOString()

  // 멱등: 이미 적립됐으면 skip
  const { data: existing } = await db
    .from('evt_pi_reward_log')
    .select('reward_st_cd')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle()
  if ((existing as { reward_st_cd: string } | null)?.reward_st_cd === 'BONDED') return

  // pi_uid 조회 (로그 기록용 — NOT NULL 제약 대응, 없으면 폴백값)
  const { data: userRow } = await db
    .from('sys_user')
    .select('pi_uid')
    .eq('id', userId)
    .maybeSingle()
  const piUid =
    (userRow as { pi_uid: string | null } | null)?.pi_uid ?? 'BOND_GRANT'

  // mps_seller_bond 현재 상태 조회
  const { data: bond } = await db
    .from('mps_seller_bond')
    .select('bond_bal_pi, rsv_pi')
    .eq('seller_id', userId)
    .eq('del_yn', 'N')
    .maybeSingle()
  const b = bond as { bond_bal_pi: number; rsv_pi: number } | null

  if (b) {
    // 기존 계좌: 잔액 +1π, 지급준비금 +0.1π
    const { error } = await db
      .from('mps_seller_bond')
      .update({
        bond_bal_pi: Number(b.bond_bal_pi) + BOND_DEPOSIT_PI,
        rsv_pi: Number(b.rsv_pi) + RESERVE_PI,
        modr_id: 'SYSTEM',
        mod_dtm: now,
      })
      .eq('seller_id', userId)
      .eq('del_yn', 'N')
    if (error) {
      console.error(`[이벤트 보증금] 잔액 증가 실패 user=${userId}:`, error.message)
      return
    }
  } else {
    // 신규 계좌 생성 (보증금 1π, 지급준비금 0.1π)
    const { error } = await db
      .from('mps_seller_bond')
      .insert({
        seller_id: userId,
        bond_bal_pi: BOND_DEPOSIT_PI,
        rsv_pi: RESERVE_PI,
        cancel_cnt: 0,
        regr_id: 'SYSTEM',
        modr_id: 'SYSTEM',
      })
    if (error) {
      console.error(`[이벤트 보증금] 신규 계좌 생성 실패 user=${userId}:`, error.message)
      return
    }
  }

  // 보상 로그 기록 (Pi A2U와 동일 테이블, reward_st_cd='BONDED'로 구분)
  await db.from('evt_pi_reward_log').upsert(
    {
      event_id: eventId,
      user_id: userId,
      pi_uid: piUid,
      reward_amt: BOND_DEPOSIT_PI,
      reward_st_cd: 'BONDED',
      paid_dtm: now,
      modr_id: 'SYSTEM',
      mod_dtm: now,
    },
    { onConflict: 'event_id,user_id' },
  )

  console.info(
    `[이벤트 보증금] 1π 적립 완료 — event=${eventId} user=${userId}`,
  )
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
