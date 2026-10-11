// 등록 심사비 결제 서버 공용 — Pi Platform API(조회·approve·complete·cancel), 요금표 조회, SITE_REG metadata 계약, 원장 조회.
//  금액은 Pi 소수(number). 서버가 fee_plan 으로 정가를 재계산해 클라이언트 금액을 신뢰하지 않는다(루트 CLAUDE.md 결제 철칙).
//  순서 철칙(2026-10-11 적대적 검증) : Pi approve 는 **검증·원장 기록 뒤**에만 — approve 뒤에는 사용자 서명·전송이 진행되므로 그 전에 거부해야 지갑이 안전하다
import 'server-only'
import { db } from './api'
import type { PlanCd } from './site'

export const PI_PAYMENTS_URL = 'https://api.minepi.com/v2/payments'
export const SITE_REG = 'SITE_REG' as const

// SDK metadata 계약 — complete RPC(fn_cmpl_site_reg_pymnt)가 site_id·plan_cd 를 읽는다
export interface SiteRegMeta {
  type: typeof SITE_REG
  site_id: string
  plan_cd: PlanCd
  usr_id: string
}

export interface RegFee {
  plan_cd: PlanCd
  pi_amt: number
  fee_plan_nm: string
  use_mon_cnt: number | null // 이용 개월수, null = 영구
  dc_pct: number | null // 1개월 단가 대비 할인율(%), null = 표시 없음(영구·기준단가 0·할인 아님)
}

// 할인율(%) = 1 - 단가 / (1개월 기준단가 × 개월수). 영구(개월 null)는 비교 기준이 없어 미표시(PRD §3-1 "—"),
// 기준단가 0 이거나 할인이 아니면(PRM1 처럼 월 환산이 더 비싸면) null
export const regFeeDiscountPct = (
  piAmt: number,
  monPiAmt: number,
  useMonCnt: number | null,
) => {
  if (useMonCnt == null) return null
  const base = monPiAmt * useMonCnt
  if (!(base > 0)) return null
  const pct = Math.round((1 - piAmt / base) * 100)
  return pct > 0 ? pct : null
}

// 요금표(REGISTER, 사용 중) — 단가 0 이면 결제 불필요
export async function getRegFees(): Promise<RegFee[]> {
  const { data, error } = await db()
    .from('fee_plan')
    .select('plan_cd, pi_amt, fee_plan_nm, sort_no, use_mon_cnt, mon_pi_amt')
    .eq('fee_tp_cd', 'REGISTER')
    .eq('use_yn', 'Y')
    .eq('del_yn', 'N')
    .order('sort_no')
  if (error) throw error
  return (data ?? []).map((r) => {
    const pi_amt = Number(r.pi_amt)
    const use_mon_cnt = r.use_mon_cnt == null ? null : Number(r.use_mon_cnt)
    return {
      plan_cd: r.plan_cd as PlanCd,
      pi_amt,
      fee_plan_nm: r.fee_plan_nm as string,
      use_mon_cnt,
      dc_pct: regFeeDiscountPct(
        pi_amt,
        Number(r.mon_pi_amt ?? 0),
        use_mon_cnt,
      ),
    }
  })
}

export async function getRegFee(planCd: string): Promise<RegFee | null> {
  const fees = await getRegFees()
  return fees.find((f) => f.plan_cd === planCd) ?? null
}

export type PiApiResult =
  | { ok: true; payment: PaymentDTO }
  | { ok: false; status: number; body: string; alreadyApproved?: PaymentDTO }

async function piApi(
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
): Promise<PiApiResult> {
  const apiKey = process.env.PI_API_KEY
  if (!apiKey) return { ok: false, status: 500, body: 'PI_API_KEY 미설정' }
  const res = await fetch(`${PI_PAYMENTS_URL}/${path}`, {
    method,
    headers: {
      Authorization: `Key ${apiKey}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  if (res.ok) return { ok: true, payment: (await res.json()) as PaymentDTO }
  const text = await res.text()
  // already_approved: 재요청 멱등 처리(cafe.pi 동일) — 결제 객체가 함께 오면 성공으로 취급
  try {
    const j = JSON.parse(text) as { error?: string; payment?: PaymentDTO }
    if (j.error === 'already_approved' && j.payment)
      return {
        ok: false,
        status: res.status,
        body: text,
        alreadyApproved: j.payment,
      }
  } catch {
    // 본문이 JSON 이 아님 — 아래 실패 반환
  }
  return { ok: false, status: res.status, body: text }
}

const enc = encodeURIComponent
// 결제 객체 조회(승인 전 검증용) — 개발자 approve 전엔 지갑 변동 없음
export const getPiPayment = (paymentId: string) => piApi(enc(paymentId), 'GET')
export const approvePiPayment = (paymentId: string) =>
  piApi(`${enc(paymentId)}/approve`, 'POST')
export const completePiPayment = (paymentId: string, txid: string) =>
  piApi(`${enc(paymentId)}/complete`, 'POST', { txid })
// 취소 — 검증 실패·사용자 취소·서명 전 이탈 복구. 실패해도 호출자는 진행(best-effort)
export const cancelPiPayment = (paymentId: string) =>
  piApi(`${enc(paymentId)}/cancel`, 'POST')

// metadata 검증 — 형태가 맞을 때만 SiteRegMeta
export function parseSiteRegMeta(meta: unknown): SiteRegMeta | null {
  if (!meta || typeof meta !== 'object') return null
  const m = meta as Record<string, unknown>
  if (m.type !== SITE_REG) return null
  if (typeof m.site_id !== 'string' || typeof m.plan_cd !== 'string')
    return null
  return {
    type: SITE_REG,
    site_id: m.site_id,
    plan_cd: m.plan_cd as PlanCd,
    usr_id: typeof m.usr_id === 'string' ? m.usr_id : '',
  }
}

export interface PymntRow {
  pymnt_id: string
  usr_id: string
  pymnt_sts_cd: 'APPROVED' | 'COMPLETED' | 'CANCELED'
  meta_val: Record<string, unknown>
}

// 원장 조회(결제자 본인 행만)
export async function getOwnPayment(
  paymentId: string,
  userId: string,
): Promise<PymntRow | null> {
  const { data, error } = await db()
    .from('pi_pymnt')
    .select('pymnt_id, usr_id, pymnt_sts_cd, meta_val')
    .eq('pymnt_id', paymentId)
    .eq('usr_id', userId)
    .eq('del_yn', 'N')
    .maybeSingle<PymntRow>()
  if (error) throw error
  return data
}

// 같은 사이트에 진행 중(APPROVED) 인 다른 결제가 있는지 — 이중 결제 방지
export async function hasOtherApprovedPayment(
  siteId: string,
  exceptPaymentId: string,
): Promise<boolean> {
  const { count, error } = await db()
    .from('pi_pymnt')
    .select('pymnt_id', { count: 'exact', head: true })
    .eq('pymnt_tp_cd', SITE_REG)
    .eq('pymnt_sts_cd', 'APPROVED')
    .eq('del_yn', 'N')
    .contains('meta_val', { site_id: siteId })
    .neq('pymnt_id', exceptPaymentId)
  if (error) throw error
  return (count ?? 0) > 0
}

// 원장 상태 전이(취소) — COMPLETED 는 건드리지 않는다. 갱신 실패는 로깅(호출자는 Pi 취소가 끝난 뒤라 응답을 바꾸지 않음)
export async function markPaymentCanceled(paymentId: string, userId: string) {
  const { error } = await db()
    .from('pi_pymnt')
    .update({
      pymnt_sts_cd: 'CANCELED',
      cncl_dtm: new Date().toISOString(),
      modr_id: userId,
    })
    .eq('pymnt_id', paymentId)
    .eq('usr_id', userId)
    .eq('pymnt_sts_cd', 'APPROVED')
  if (error)
    console.error('[payments] markPaymentCanceled', paymentId, error.message)
}
