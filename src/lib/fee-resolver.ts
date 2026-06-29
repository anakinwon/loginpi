import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

// 이중 요금제(Bean/Pi) 런타임 해석 — PRD_24 §6·§10.
// fee_mode_config(BEAN|PI) 플래그를 읽어 요금/보상의 차감·지급 단위를 결정한다.
// ⚠️ 결제 시점은 캐시 대신 DB 직접 조회(전환 직후 Bean/Pi 혼재 방지 — PRD_24 v0.3).

export type FeeMode = 'BEAN' | 'PI'

/** 현재 활성 요금제 모드. 조회 실패 시 안전 기본값 BEAN(레드라인 회피보다 기존 동작 우선). */
export async function getActiveFeeMode(): Promise<FeeMode> {
  try {
    const { data, error } = await getSupabaseAdmin().rpc(
      'fn_get_active_fee_mode',
    )
    if (error) return 'BEAN'
    return data === 'PI' ? 'PI' : 'BEAN'
  } catch {
    return 'BEAN'
  }
}

/** Bean 금액(정수) → 1:100 Pi 환산. Bean 정수라 항상 소수 2자리 이내(완벽 매핑). */
export function beanToPi(beanAmt: number): number {
  return Math.round(beanAmt) / 100
}

/** Pi 금액 → Bean 환산(역방향, 예치 등). */
export function piToBean(piAmt: number): number {
  return Math.round(piAmt * 100)
}

export interface ResolvedFee {
  mode: FeeMode
  /** 원본 Bean 금액(정본) */
  bean: number
  /** 1:100 Pi 환산값 */
  pi: number
}

/** 모드별 요금 표현 해석. 실제 차감/지급 단위는 호출부가 mode로 분기(BEAN=Bean 지갑 / PI=Pi 결제·A2U). */
export function resolveFee(beanAmt: number, mode: FeeMode): ResolvedFee {
  return { mode, bean: beanAmt, pi: beanToPi(beanAmt) }
}

/**
 * 마이크로 요금(입장·번역·AI·배지·부스팅)의 실제 차감액 — PRD_24 §0.
 *   PI 모드(메인넷 등재 기간)에서는 무료화(0). 0.05 Pi를 Pi Browser 승인 왕복으로
 *   결제하는 것이 비현실적이라 면제한다(구독만 Pi 직결제로 전환).
 *   BEAN 모드에서는 원래 Bean 요금 그대로.
 * @param mode 이미 조회한 모드가 있으면 전달(중복 DB 조회 회피)
 */
export async function microFeeBean(
  beanAmt: number,
  mode?: FeeMode,
): Promise<number> {
  const m = mode ?? (await getActiveFeeMode())
  return m === 'PI' ? 0 : beanAmt
}
