import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

// 이중 요금제(Bean/Pi) 런타임 해석 — PRD_24 §6·§10.
// fee_mode_config(BEAN|PI) 플래그를 읽어 요금/보상의 차감·지급 단위를 결정한다.
// ⚠️ 결제 시점은 캐시 대신 DB 직접 조회(전환 직후 Bean/Pi 혼재 방지 — PRD_24 v0.3).
//
// 오픈기념행사 무료요금 정책 — PRD_26.
// promo_fee_config(활성플래그 + 시간범위)를 읽어 모든 9개 요금 품목 무료 여부를 판정한다.
// 프로모 ON → 모든 청구 경로 요금 0으로 오버라이드. 정상요금 정의(bean_fee_plan) 비파괴.

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

// ── 오픈기념행사 무료요금 게이트 (PRD_26) ──────────────────────────────

/**
 * 오픈기념행사 프로모션 활성 여부. 모든 요금 청구 경로의 단일 게이트.
 * true → 모든 9개 요금 품목 무료(0으로 오버라이드).
 * false → 정상요금 적용.
 *
 * 활성 판정:
 *   promo_active_yn = 'Y' AND
 *   (promo_start_dtm IS NULL OR 현재 >= 시작시각) AND
 *   (promo_end_dtm IS NULL OR 현재 < 종료시각)
 *
 * 결제 시점에 항상 DB 직접 조회(캐시 금지) — 종료 직후 혼재 방지.
 */
export async function isOpenPromoActive(): Promise<boolean> {
  try {
    const { data, error } = await getSupabaseAdmin().rpc(
      'fn_is_open_promo_active',
    )
    if (error) return false
    return data === true
  } catch {
    return false
  }
}

/**
 * 오픈 프로모 상태(활성 여부 + 종료시각). 홈 배너의 client 실시간 자동 숨김용.
 *   active = is_active_now(시작·종료 시각 반영). endDtm = 종료시각(NULL=무제한).
 *   client는 endDtm까지 타이머를 걸어 종료시각 도달 시 즉시 배너를 내린다(재로드 불필요).
 */
export async function getOpenPromoState(): Promise<{
  active: boolean
  endDtm: string | null
}> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('v_promo_fee_current')
      .select('is_active_now, promo_end_dtm')
      .maybeSingle()
    if (error || !data) return { active: false, endDtm: null }
    return {
      active: data.is_active_now === true,
      endDtm: data.promo_end_dtm ?? null,
    }
  } catch {
    return { active: false, endDtm: null }
  }
}

/**
 * 요금 적용 게이트 — 프로모션 무료화 오버라이드.
 * @param normalFeeBean 정상요금(정본 bean_fee_plan)
 * @returns 프로모 활성 시 0, 비활성 시 정상요금
 */
export async function applyPromoGate(normalFeeBean: number): Promise<number> {
  if (await isOpenPromoActive()) {
    return 0
  }
  return normalFeeBean
}
