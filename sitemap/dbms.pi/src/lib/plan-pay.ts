// dbms.pi 요금제 결제 서버 공용(sql/035) — 원화 기준가 재계산(구독·업그레이드 규칙), 결제 견적(원화 → Pi, 묶음 할인, 서명 10분), DBM_PLAN 검증기, 진행 중 결제 정리.
//  흐름 : prepare(서버가 금액·memo·metadata+서명 결정) → SDK createPayment → approve(@pi/payments approvePayment + 이 검증기) → 서명 → complete(fn_cmpl_dbm_lnk_plan)
//  철칙 : 클라이언트 금액 불신(서명 견적 + 승인 때 원화 기준가 재계산 대조), memo ASCII, 결제자 = 연결 소유자 또는 ADMIN
import 'server-only'
import { getPiPayment, markPaymentCanceled, type FlowInput, type Validators } from '@pi/payments'
import type { UserRow } from '@pi/db'
import { env } from '@/env'
import { db } from './api'
import { isAdmin } from './auth'
import { feeRows, planTerms, type FeeRow } from './plan'
import {
  DBM_PLAN,
  krwDue,
  metaKey,
  PAID_PLANS,
  parsePlanMeta,
  pickCur,
  planRank,
  SLACK_MS,
  STALE_LOOKUP_MAX,
  stalePayState,
  subscribed,
  upgradeFee,
  type Cur,
  type PaidPlan,
  type PlanTerm,
} from './plan-rules'
import { verifyQuote } from './plan-quote'

// @pi/payments 에 넘길 클라이언트 — supabase-js 타입 버전만 다름(seminar.pi payDb 와 같은 단언)
// ponytail: 타입 단언, supabase-js 버전 정렬 시 제거
export const payDb = () => db() as unknown as FlowInput['db']

// 판매 중 가격표(원화) — 키 = 요금제 + 주기(예 'D2M')
export const priceMap = (rows: FeeRow[]) =>
  Object.fromEntries(rows.filter((r) => r.use_yn === 'Y' && r.plan_cd !== 'FREE').map((r) => [r.plan_cd + r.prd_cd, r.krw_amt]))

export type PayReq = { plan_cd: PaidPlan; prd_cd: 'M' | 'Y' | 'U'; prd?: 'M' | 'Y' }
export type Base = { ok: true; krw: number; pre: number; prd: 'M' | 'Y' | null } | { ok: false; code: 'PAY_SUBSCRIBED' | 'PAY_UPGRADE' | 'NOT_FOUND' }

// 원화 기준가(할인 전) — 구독 중이면 업그레이드·현재 요금제 선결제만(schema.pi 규칙), 업그레이드 = 현재 요금제 기간 일할계산
export function baseKrw(r: PayReq, cur: Cur, terms: PlanTerm[], rows: FeeRow[], now: number): Base {
  const price = priceMap(rows)
  if (r.prd_cd !== 'U') {
    if (subscribed(cur) && r.plan_cd !== cur.plan) return { ok: false, code: 'PAY_SUBSCRIBED' }
    const krw = price[r.plan_cd + r.prd_cd]
    return krw > 0 ? { ok: true, krw, pre: 0, prd: null } : { ok: false, code: 'NOT_FOUND' }
  }
  if (!subscribed(cur)) return { ok: false, code: 'PAY_UPGRADE' }
  const q = upgradeFee(terms.filter((t) => t.plan_cd === cur.plan), price, cur.plan, r.plan_cd, now, r.prd ?? 'M')
  return q ? { ok: true, krw: Math.ceil(q.amount - 1e-9), pre: q.terms, prd: q.prd } : { ok: false, code: 'PAY_UPGRADE' }
}

// 업그레이드 선택지(요금제 화면) — 같은·상위 요금제 × 새 주기, 금액 = 원화 기준가
export function upgradeOptions(cur: Cur, terms: PlanTerm[], rows: FeeRow[], now: number) {
  if (!subscribed(cur)) return []
  return PAID_PLANS.filter((p) => planRank(p) >= planRank(cur.plan)).flatMap((to) =>
    (['M', 'Y'] as const).flatMap((prd) => {
      const b = baseKrw({ plan_cd: to, prd_cd: 'U', prd }, cur, terms, rows, now)
      return b.ok ? [{ plan_cd: to, prd, krw: b.krw }] : []
    }),
  )
}

// 같은 연결의 진행 중(APPROVED) 요금제 결제 ID — prepare·검증기 공용(상한 STALE_LOOKUP_MAX + 1, R-P3)
export async function otherPlanPays(lnkId: string, exceptId?: string): Promise<string[]> {
  let q = db()
    .from('pi_pymnt')
    .select('pymnt_id')
    .eq('pymnt_tp_cd', DBM_PLAN)
    .eq('pymnt_sts_cd', 'APPROVED')
    .eq('del_yn', 'N')
    .eq('meta_val->>lnk_id', lnkId)
  if (exceptId) q = q.neq('pymnt_id', exceptId)
  const { data, error } = await q.limit(STALE_LOOKUP_MAX + 1)
  if (error) throw error
  return (data ?? []).map((r) => r.pymnt_id as string)
}

// 이전 APPROVED 결제 정리(seminar.pi staleBusy 승계) — Pi 조회 병렬(R-P1). 취소·만료 = 원장 CANCELED(본인 행만 — 남의 행은 그대로), 서명 없이 3분 지남 = 막지 않음, 진행 중·판정 불가 = 막음
export async function staleBusy(ids: string[], usrId: string): Promise<boolean> {
  if (ids.length > STALE_LOOKUP_MAX) return true
  const states = await Promise.all(ids.map(async (id) => stalePayState(await getPiPayment(id))))
  if (states.includes('pending')) return true
  await Promise.all(ids.filter((_, i) => states[i] === 'gone').map((id) => markPaymentCanceled(payDb(), id, usrId)))
  return false
}

// DBM_PLAN 검증기 — 서명 견적(본인·metadata 일치·10분) + 결제자(연결 소유자·ADMIN) + 진행 중 결제 + 원화 기준가 재계산 대조. 금액 = 견적의 Pi 금액
export function planValidators(user: UserRow): Validators {
  return {
    [DBM_PLAN]: async ({ payment }) => {
      const meta = parsePlanMeta(payment.metadata)
      if (!meta) return { ok: false, code: 'META_INVALID', status: 400 }
      const v = verifyQuote(meta.q, env.PI_SESSION_SECRET)
      if (!v.ok) return v.why === 'EXPIRED' ? { ok: false, code: 'QUOTE_EXPIRED', status: 409 } : { ok: false, code: 'META_INVALID', status: 400 }
      if (v.q.u !== user.id || v.q.m !== metaKey(meta)) return { ok: false, code: 'META_INVALID', status: 400 }
      // R-P1 — 연결·기간·요금표·진행 중 결제는 서로 독립
      const [lnk, terms, rows, others] = await Promise.all([
        db().from('dbm_lnk').select('usr_id').eq('lnk_id', meta.lnk_id).eq('del_yn', 'N').maybeSingle(),
        planTerms(meta.lnk_id),
        feeRows(),
        otherPlanPays(meta.lnk_id, payment.identifier),
      ])
      if (lnk.error) throw lnk.error
      if (!lnk.data || (lnk.data.usr_id !== user.id && !isAdmin(user))) return { ok: false, code: 'PAY_PAYER', status: 403 }
      if (await staleBusy(others, user.id)) return { ok: false, code: 'ALREADY_PAID', status: 409 }
      // 원화 기준가 재계산 — 업그레이드는 사용 일수가 견적 뒤 날짜 경계를 넘을 수 있어 10분 전 기준도 허용(schema.pi approve 와 같은 창)
      const now = Date.now()
      const cur = pickCur(terms, now)
      if (meta.prd_cd === 'U' && meta.from_plan !== cur.plan) return { ok: false, code: 'PAY_UPGRADE', status: 409 }
      const r: PayReq = { plan_cd: meta.plan_cd, prd_cd: meta.prd_cd, prd: meta.prd ?? undefined }
      const fits = [now, now - SLACK_MS].some((t) => {
        const b = baseKrw(r, pickCur(terms, t), terms, rows, t)
        return b.ok && b.krw === v.q.k && b.pre === meta.pre && b.prd === meta.prd
      })
      if (!fits) return { ok: false, code: 'PAY_PRICE_CHANGED', status: 409 }
      if (krwDue(v.q.k, meta.bndl) == null) return { ok: false, code: 'META_INVALID', status: 400 }
      return { ok: true, amount: v.q.a }
    },
  }
}
