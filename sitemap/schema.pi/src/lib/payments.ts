// 분류체계 요금제 Pi U2A 결제(서버 전용, 2026-10-19) — sitemap.pi src/lib/payments.ts 이식(요금제 결제 AREA_PLAN 만)
//  흐름 : prepare(서버가 금액·memo·metadata 결정) → SDK createPayment → approve(Pi 조회·검증 → 원장 APPROVED → Pi approve) → 서명 → complete(Pi complete → fn_area_plan_grant)
//  철칙 : 클라이언트 금액 불신(요금표 sys_fee_plan 로 정가 재계산), memo 는 ASCII 만, 결제 = 분류체계 시스템담당자·데이터아키텍트(마스터 결정 2026-10-19)
import 'server-only'
import { NextResponse } from 'next/server'
import { apiError, dbError, requireAreaRole, type CurrentUser } from './api'
import { db } from './db'
import { isPlan, type PlanCd } from './roles'

export const PI_PAYMENTS_URL = 'https://api.minepi.com/v2/payments'
export const AREA_PLAN = 'AREA_PLAN'
export const PAYER_ROLES = ['SYS', 'DA'] as const

// Pi Platform 결제 객체(쓰는 칸만)
export interface PiPayment {
  identifier: string
  user_uid: string
  amount: number
  memo: string
  metadata: unknown
  direction: string
  status: { developer_approved: boolean; transaction_verified: boolean; developer_completed: boolean; cancelled: boolean; user_cancelled: boolean }
  transaction: { txid: string } | null
}

export interface AreaPlanMeta {
  type: typeof AREA_PLAN
  area_id: string
  plan_cd: Exclude<PlanCd, 'FREE'>
  prd_cd: 'M' | 'Y' | 'U' // U = 업그레이드(일할계산, src/lib/upgrade.ts)
  from_plan?: Exclude<PlanCd, 'FREE'> // 업그레이드 전 요금제(U 만)
  prd?: 'M' | 'Y' // 업그레이드 새 주기(U 만 = 현재 기간 주기, 승인 때 다시 대조, 반영 = 승인 시각부터 1개월·1년)
}

// metadata 검증 — 형태가 맞을 때만
export function parseAreaPlanMeta(meta: unknown): AreaPlanMeta | null {
  if (!meta || typeof meta !== 'object') return null
  const m = meta as Record<string, unknown>
  if (m.type !== AREA_PLAN || typeof m.area_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(m.area_id)) return null
  if (!isPlan(m.plan_cd) || m.plan_cd === 'FREE' || (m.prd_cd !== 'M' && m.prd_cd !== 'Y' && m.prd_cd !== 'U')) return null
  if (m.prd_cd !== 'U') return { type: AREA_PLAN, area_id: m.area_id, plan_cd: m.plan_cd, prd_cd: m.prd_cd }
  if (m.prd !== 'M' && m.prd !== 'Y') return null
  if (!isPlan(m.from_plan) || m.from_plan === 'FREE' || m.from_plan > m.plan_cd || (m.from_plan === m.plan_cd && m.prd !== 'Y')) return null // 상위 요금제 또는 같은 요금제 월 → 연
  return { type: AREA_PLAN, area_id: m.area_id, plan_cd: m.plan_cd, prd_cd: 'U', from_plan: m.from_plan, prd: m.prd }
}

// 결제자 확인 — 분류체계 멤버 + 역할 SYS·DA(요금제와 무관 : 무료·만료여도 결제 가능) + Pi 계정(pi_uid). 사용자·pi_uid 또는 오류 응답
export async function payerAuth(areaId: string): Promise<{ user: CurrentUser; piUid: string } | NextResponse> {
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  if (!(PAYER_ROLES as readonly string[]).includes(auth.role)) return apiError('PAY_PAYER', 403)
  const { data, error } = await db().from('sys_user').select('pi_uid').eq('usr_id', auth.user.usr_id).maybeSingle()
  if (error) return dbError(error)
  if (!data?.pi_uid) return apiError('PAY_PI_SESSION', 403)
  return { user: auth.user, piUid: data.pi_uid }
}

// 결제 memo(ASCII 만 — ™·한글은 결제 호환 위험)
export const planMemo = (m: Pick<AreaPlanMeta, 'plan_cd' | 'prd_cd' | 'from_plan'>) =>
  m.prd_cd === 'U' ? `schema.pi plan ${m.from_plan} to ${m.plan_cd} upgrade` : `schema.pi plan ${m.plan_cd} ${m.prd_cd === 'Y' ? 'yearly' : 'monthly'}`

// 요금표 정가(없거나 꺼짐 = null)
export async function planPrice(planCd: string, prdCd: string): Promise<number | null> {
  const { data, error } = await db().from('sys_fee_plan').select('pi_amt').eq('plan_cd', planCd).eq('prd_cd', prdCd).eq('use_yn', 'Y').eq('del_yn', 'N').maybeSingle()
  if (error) throw error
  const a = Number(data?.pi_amt ?? 0)
  return a > 0 ? a : null
}

export type PiApiResult = { ok: true; payment: PiPayment } | { ok: false; status: number; body: string; alreadyApproved?: PiPayment }

async function piApi(path: string, method: 'GET' | 'POST', body?: unknown): Promise<PiApiResult> {
  const apiKey = process.env.PI_API_KEY
  if (!apiKey) return { ok: false, status: 500, body: 'PI_API_KEY 미설정' }
  let res: Response
  try {
    res = await fetch(`${PI_PAYMENTS_URL}/${path}`, {
      method,
      headers: { Authorization: `Key ${apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
  } catch (e) {
    return { ok: false, status: 0, body: e instanceof Error ? e.message : 'fetch' } // 네트워크 예외·8초 타임아웃
  }
  if (res.ok) return { ok: true, payment: (await res.json()) as PiPayment }
  const text = await res.text()
  try {
    const j = JSON.parse(text) as { error?: string; payment?: PiPayment }
    if (j.error === 'already_approved' && j.payment) return { ok: false, status: res.status, body: text, alreadyApproved: j.payment } // 재요청 멱등
  } catch {
    // 본문이 JSON 아님
  }
  return { ok: false, status: res.status, body: text }
}

const enc = encodeURIComponent
export const getPiPayment = (id: string) => piApi(enc(id), 'GET')
export const approvePiPayment = (id: string) => piApi(`${enc(id)}/approve`, 'POST')
export const completePiPayment = (id: string, txid: string) => piApi(`${enc(id)}/complete`, 'POST', { txid })
export const cancelPiPayment = (id: string) => piApi(`${enc(id)}/cancel`, 'POST') // 실패해도 호출자는 진행(best-effort)

export interface PymntRow {
  pymnt_id: string
  usr_id: string
  pymnt_sts_cd: 'APPROVED' | 'COMPLETED' | 'CANCELED'
  pymnt_tp_cd: string
  meta_val: Record<string, unknown>
}

// 원장 조회(결제자 본인 행만)
export async function getOwnPayment(id: string, usrId: string): Promise<PymntRow | null> {
  const { data, error } = await db().from('pi_pymnt').select('pymnt_id, usr_id, pymnt_sts_cd, pymnt_tp_cd, meta_val').eq('pymnt_id', id).eq('usr_id', usrId).eq('del_yn', 'N').maybeSingle<PymntRow>()
  if (error) throw error
  return data
}

// 같은 분류체계에 진행 중(APPROVED, 최근 15분) 인 다른 요금제 결제 — 이중 결제 방지. 방치된 오래된 APPROVED 는 막지 않음(검증 지적 m1)
export const APPROVED_HOLD_MS = 15 * 60_000
//  Pi 에서 이미 취소된(잔액 부족·사용자 취소 등, 거래 없음) 결제는 원장을 CANCELED 로 정리하고 세지 않음 — 남기면 15분 동안 새 결제가 PAY_DUP(운영 2026-10-19)
export async function hasOtherApproved(areaId: string, exceptId: string): Promise<boolean> {
  const since = new Date(Date.now() - APPROVED_HOLD_MS).toISOString()
  const { data, error } = await db().from('pi_pymnt').select('pymnt_id, usr_id').eq('pymnt_tp_cd', AREA_PLAN).eq('pymnt_sts_cd', 'APPROVED').eq('del_yn', 'N').eq('meta_val->>area_id', areaId).gt('apv_dtm', since).neq('pymnt_id', exceptId)
  if (error) throw error
  for (const r of data ?? []) {
    if (await piCancelled(r.pymnt_id)) await markCanceled(r.pymnt_id, r.usr_id)
    else return true // 진행 중(또는 Pi 조회 실패 = 보수적으로 진행 중)
  }
  return false
}

// Pi 에서 취소됐고 거래(서명)가 없는 결제인지 — 조회 실패 = false
export async function piCancelled(id: string): Promise<boolean> {
  const got = await getPiPayment(id)
  return got.ok && (got.payment.status.cancelled || got.payment.status.user_cancelled) && !got.payment.transaction
}

// 서명된 결제 마무리(complete·cancel·미완료 복구 공용, 검증 지적 M1·M2) — Pi 에 결제 상태를 직접 물어
//  서명 전(거래 없음) = { unsigned } / 서명됨 = Pi complete(이미 완료면 건너뜀) → 원장 COMPLETED + 요금제 반영(RPC, 재호출 안전)
//  txid 는 클라이언트 값이 아니라 Pi 가 돌려준 거래 ID 를 쓴다. 본인 원장만
export type Settle = { ok: true; plan_cd: string; end_dtm: string } | { ok: false; unsigned?: true; code: 'PAY_MISMATCH' | 'PAY_PI_KEY' | 'PAY_PI_FAILED'; status: number }
export async function settlePaid(id: string, usrId: string): Promise<Settle> {
  const row = await getOwnPayment(id, usrId)
  if (!row || row.pymnt_sts_cd === 'CANCELED') return { ok: false, code: 'PAY_MISMATCH', status: 409 }
  const g = await getPiPayment(id)
  if (!g.ok) return g.status === 500 ? { ok: false, code: 'PAY_PI_KEY', status: 500 } : { ok: false, code: 'PAY_PI_FAILED', status: 502 }
  const txid = g.payment.transaction?.txid
  if (!txid) return { ok: false, unsigned: true, code: 'PAY_MISMATCH', status: 409 }
  if (!g.payment.status.developer_completed) {
    const c = await completePiPayment(id, txid)
    if (!c.ok) {
      // 다른 요청이 먼저 완료했을 수 있음 — 다시 조회해 완료면 진행
      const again = await getPiPayment(id)
      if (!again.ok || !again.payment.status.developer_completed) {
        console.error('[payments] Pi complete', c.status, c.body.slice(0, 300))
        return { ok: false, code: 'PAY_PI_FAILED', status: 502 }
      }
    }
  }
  const { data, error } = await db().rpc('fn_cmpl_area_plan_pymnt', { p_pymnt_id: id, p_tx_id: txid, p_usr_id: usrId })
  if (error) {
    console.error('[payments] fn_cmpl_area_plan_pymnt', error.code, error.message)
    if (error.code === 'MPL01') return { ok: false, code: 'PAY_MISMATCH', status: 409 }
    throw error // 일시 오류 = 원장 APPROVED 유지 → 재시도·다음 로그인 미완료 복구 대상
  }
  const r = data as { plan_cd: string; end_dtm: string }
  return { ok: true, plan_cd: r.plan_cd, end_dtm: r.end_dtm }
}

// 원장 취소 — COMPLETED 는 건드리지 않음
export async function markCanceled(id: string, usrId: string): Promise<boolean> {
  const { error } = await db().from('pi_pymnt').update({ pymnt_sts_cd: 'CANCELED', cncl_dtm: new Date().toISOString(), modr_id: usrId }).eq('pymnt_id', id).eq('usr_id', usrId).eq('pymnt_sts_cd', 'APPROVED')
  if (error) console.error('[payments] markCanceled', id, error.message)
  return !error
}
