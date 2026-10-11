// 등록 심사비 결제 서버 공용 — Pi Platform API(approve·complete) 호출, 요금표 조회, SITE_REG metadata 계약.
//  금액은 Pi 소수(number). 서버가 fee_plan 으로 정가를 재계산해 클라이언트 금액을 신뢰하지 않는다(루트 CLAUDE.md 결제 철칙)
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
}

// 요금표(REGISTER, 사용 중) — 단가 0 이면 결제 불필요
export async function getRegFees(): Promise<RegFee[]> {
  const { data, error } = await db()
    .from('fee_plan')
    .select('plan_cd, pi_amt, fee_plan_nm, sort_no')
    .eq('fee_tp_cd', 'REGISTER')
    .eq('use_yn', 'Y')
    .eq('del_yn', 'N')
    .order('sort_no')
  if (error) throw error
  return (data ?? []).map((r) => ({
    plan_cd: r.plan_cd as PlanCd,
    pi_amt: Number(r.pi_amt),
    fee_plan_nm: r.fee_plan_nm as string,
  }))
}

export async function getRegFee(planCd: string): Promise<RegFee | null> {
  const fees = await getRegFees()
  return fees.find((f) => f.plan_cd === planCd) ?? null
}

export type PiApiResult =
  | { ok: true; payment: PaymentDTO }
  | { ok: false; status: number; body: string; alreadyApproved?: PaymentDTO }

async function piApi(path: string, body?: unknown): Promise<PiApiResult> {
  const apiKey = process.env.PI_API_KEY
  if (!apiKey) return { ok: false, status: 500, body: 'PI_API_KEY 미설정' }
  const res = await fetch(`${PI_PAYMENTS_URL}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
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

export const approvePiPayment = (paymentId: string) =>
  piApi(`${encodeURIComponent(paymentId)}/approve`)
export const completePiPayment = (paymentId: string, txid: string) =>
  piApi(`${encodeURIComponent(paymentId)}/complete`, { txid })

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
