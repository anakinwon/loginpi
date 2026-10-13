// 사용료 결제 서버 공용 — Pi Platform API(조회·approve·complete·cancel), 요금표 조회, SITE_REG metadata 계약, 원장 조회.
//  금액은 Pi 소수(number). 서버가 fee_plan 으로 정가를 재계산해 클라이언트 금액을 신뢰하지 않는다(루트 CLAUDE.md 결제 철칙).
//  순서 철칙(2026-10-11 적대적 검증) : Pi approve 는 **검증·원장 기록 뒤**에만 — approve 뒤에는 사용자 서명·전송이 진행되므로 그 전에 거부해야 지갑이 안전하다
import 'server-only'
import { db } from './api'
import {
  APPLY_PLAN_CD,
  OCCUPY_STS,
  PLAN_CAP,
  EFCT_CD,
  type ApplyPlanCd,
  type EfctCd,
  type PlanCd,
} from './site'

export const PI_PAYMENTS_URL = 'https://api.minepi.com/v2/payments'
export const SITE_REG = 'SITE_REG' as const
// 반짝임 부가서비스 단독 결제 — complete RPC fn_cmpl_site_spk_pymnt(sql/013)
export const SITE_SPK = 'SITE_SPK' as const
// 버블 이펙트 단독 결제 — complete RPC fn_cmpl_site_efct_pymnt(sql/017)
export const SITE_EFCT = 'SITE_EFCT' as const

// SDK metadata 계약 — complete RPC(fn_cmpl_site_reg_pymnt)가 site_id·plan_cd 를 읽는다
export interface SiteRegMeta {
  type: typeof SITE_REG
  site_id: string
  plan_cd: PlanCd
  usr_id: string
  spk: 'Y' | 'N' // 합산 결제에 반짝임 부가서비스 포함 여부 — RPC 가 spk_* 기록
  efct?: EfctCd // 합산 결제에 포함된 버블 이펙트 — RPC 가 efct_* 기록(없으면 미포함)
}
export interface SiteEfctMeta {
  type: typeof SITE_EFCT
  site_id: string
  usr_id: string
  efct: EfctCd
}
export interface SiteSpkMeta {
  type: typeof SITE_SPK
  site_id: string
  usr_id: string
}

export interface RegFee {
  plan_cd: PlanCd
  pi_amt: number
  fee_plan_nm: string
  use_mon_cnt: number | null // 이용 개월수, null = 영구
  dc_pct: number | null // 1개월 단가 대비 할인율(%), null = 표시 없음(기준단가 0·할인 아님). 영구는 10년 환산
}

// 영구 요금제의 할인율 환산 개월수 — 마스터 확정 2026-10-11 "영구도 10년 환산으로 할인 표시"(PRD §3-1 영구 = 10년 상각)
export const LIFETIME_MONTHS = 120

// 할인율(%) = 1 - 단가 / (1개월 기준단가 × 개월수). 기준단가 0 이거나 할인이 아니면 null
export const regFeeDiscountPct = (
  piAmt: number,
  monPiAmt: number,
  useMonCnt: number | null,
) => {
  const base = monPiAmt * (useMonCnt ?? LIFETIME_MONTHS)
  if (!(base > 0)) return null
  // 소수 2자리(마스터 요금표 16.67·33.33·45.83% 와 일치, sql/015)
  const pct = Math.round((1 - piAmt / base) * 10000) / 100
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
      dc_pct: regFeeDiscountPct(pi_amt, Number(r.mon_pi_amt ?? 0), use_mon_cnt),
    }
  })
}

// 요금제별 남은 슬롯 — PLAN_CAP − 점유 상태(APPLYING·PAID·IN_USE·USED·SUSPENDED) 실사이트 수. 음수는 0 으로 고정(상한 초과 등록은 막지 않는다)
export async function getPlanRemaining(): Promise<Record<ApplyPlanCd, number>> {
  const { data, error } = await db()
    .from('site_mst')
    .select('plan_cd')
    .eq('del_yn', 'N')
    .in('site_sts_cd', OCCUPY_STS)
    .in('plan_cd', APPLY_PLAN_CD)
  if (error) throw error
  const used: Record<string, number> = {}
  for (const r of data ?? []) used[r.plan_cd] = (used[r.plan_cd] ?? 0) + 1
  return Object.fromEntries(
    APPLY_PLAN_CD.map((p) => [p, Math.max(0, PLAN_CAP[p] - (used[p] ?? 0))]),
  ) as Record<ApplyPlanCd, number>
}

// 반짝임 부가서비스 단가 — fee_plan SPARKLE × 요금제(sql/014). 없음·미판매·0 이면 null(판매 안 함)
// 버블 이펙트 단가 — fee_plan EFFECT × 요금제(sql/017, 3종 공통). 없음·미판매·0 이면 null
export async function getEfctFee(planCd: string): Promise<number | null> {
  const { data, error } = await db()
    .from('fee_plan')
    .select('pi_amt')
    .eq('fee_tp_cd', 'EFFECT')
    .eq('plan_cd', planCd)
    .eq('use_yn', 'Y')
    .eq('del_yn', 'N')
    .limit(1)
    .maybeSingle<{ pi_amt: number | string }>()
  if (error) throw error
  const amt = Number(data?.pi_amt ?? 0)
  return amt > 0 ? amt : null
}

export async function getSpkFee(planCd: string): Promise<number | null> {
  const { data, error } = await db()
    .from('fee_plan')
    .select('pi_amt')
    .eq('fee_tp_cd', 'SPARKLE')
    .eq('plan_cd', planCd)
    .eq('use_yn', 'Y')
    .eq('del_yn', 'N')
    .limit(1)
    .maybeSingle<{ pi_amt: number | string }>()
  if (error) throw error
  const amt = Number(data?.pi_amt ?? 0)
  return amt > 0 ? amt : null
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
  // 네트워크 예외·8초 타임아웃은 { ok:false, status:0 } 으로 정규화 — 호출자가 throw(500) 대신 건별 거부·skip 으로 처리(크론 회차 격리, 적대적 리뷰 2026-10-13)
  let res: Response
  try {
    res = await fetch(`${PI_PAYMENTS_URL}/${path}`, {
      method,
      headers: {
        Authorization: `Key ${apiKey}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
  } catch (e) {
    return {
      ok: false,
      status: 0,
      body: e instanceof Error ? e.message : 'fetch',
    }
  }
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
    spk: m.spk === 'Y' ? 'Y' : 'N',
    ...(isEfctCd(m.efct) && { efct: m.efct }),
  }
}

const isEfctCd = (v: unknown): v is EfctCd =>
  typeof v === 'string' && (EFCT_CD as readonly string[]).includes(v)

export function parseSiteEfctMeta(meta: unknown): SiteEfctMeta | null {
  if (!meta || typeof meta !== 'object') return null
  const m = meta as Record<string, unknown>
  if (
    m.type !== SITE_EFCT ||
    typeof m.site_id !== 'string' ||
    !isEfctCd(m.efct)
  )
    return null
  return {
    type: SITE_EFCT,
    site_id: m.site_id,
    usr_id: typeof m.usr_id === 'string' ? m.usr_id : '',
    efct: m.efct,
  }
}

export function parseSiteSpkMeta(meta: unknown): SiteSpkMeta | null {
  if (!meta || typeof meta !== 'object') return null
  const m = meta as Record<string, unknown>
  if (m.type !== SITE_SPK || typeof m.site_id !== 'string') return null
  return {
    type: SITE_SPK,
    site_id: m.site_id,
    usr_id: typeof m.usr_id === 'string' ? m.usr_id : '',
  }
}

export interface PymntRow {
  pymnt_id: string
  usr_id: string
  pymnt_sts_cd: 'APPROVED' | 'COMPLETED' | 'CANCELED'
  pymnt_tp_cd: string // SITE_REG | SITE_SPK — complete 가 RPC 를 고른다
  meta_val: Record<string, unknown>
}

// 원장 조회(결제자 본인 행만)
export async function getOwnPayment(
  paymentId: string,
  userId: string,
): Promise<PymntRow | null> {
  const { data, error } = await db()
    .from('pi_pymnt')
    .select('pymnt_id, usr_id, pymnt_sts_cd, pymnt_tp_cd, meta_val')
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
  // type 생략 = 두 유형 모두(철회·정지 가드 — 반짝임 단독 결제 진행 중에도 상태 전이를 막는다)
  type?: typeof SITE_REG | typeof SITE_SPK | typeof SITE_EFCT,
): Promise<boolean> {
  const { count, error } = await db()
    .from('pi_pymnt')
    .select('pymnt_id', { count: 'exact', head: true })
    .in('pymnt_tp_cd', type ? [type] : [SITE_REG, SITE_SPK, SITE_EFCT])
    .eq('pymnt_sts_cd', 'APPROVED')
    .eq('del_yn', 'N')
    // meta_val->>'site_id' 동등 비교 — sql/012·013 식 부분 인덱스(idx_pi_pymnt_meta_val_site_id*)를 탄다(JSONB @> 는 못 탐)
    .eq('meta_val->>site_id', siteId)
    .neq('pymnt_id', exceptPaymentId)
  if (error) throw error
  return (count ?? 0) > 0
}

// 원장 상태 전이(취소) — COMPLETED 는 건드리지 않는다. 갱신 실패는 로깅(호출자는 Pi 취소가 끝난 뒤라 응답을 바꾸지 않음)
//  actor : modr_id 기록 주체 — 본인 취소는 userId, 크론 미결제 반려는 'SYSTEM'
export async function markPaymentCanceled(
  paymentId: string,
  userId: string,
  actor: string = userId,
): Promise<boolean> {
  const { error } = await db()
    .from('pi_pymnt')
    .update({
      pymnt_sts_cd: 'CANCELED',
      cncl_dtm: new Date().toISOString(),
      modr_id: actor,
    })
    .eq('pymnt_id', paymentId)
    .eq('usr_id', userId)
    .eq('pymnt_sts_cd', 'APPROVED')
  if (error)
    console.error('[payments] markPaymentCanceled', paymentId, error.message)
  return !error
}
