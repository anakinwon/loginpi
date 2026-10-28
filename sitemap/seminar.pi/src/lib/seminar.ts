// 세미나 서버 공용 — 목록·상세 조회 칼럼, 입장 결제(SMN_ENT)·요금제 결제(SMN_PLAN) 검증기, @pi/payments 실패 → apiError 응답.
// 검증기는 서버 DB 의 smn_mst.ent_pi_amt 로 정가를 재계산한다(클라이언트 금액 불신, PRD D-5·D-10)
import 'server-only'
import {
  getPiPayment,
  markPaymentCanceled,
  type FlowInput,
  type PayFail,
  type Validators,
} from '@pi/payments'
import { env } from '@/env'
import { apiError, db } from './api'
import { SMN_PLAN, verifyQuote } from './plan-rules'
import {
  isUuid,
  OPEN_STS,
  payErrorCode,
  smnTitle,
  STALE_LOOKUP_MAX,
  stalePayState,
} from './seminar-rules'

export const SMN_ENT = 'SMN_ENT'

// @pi/payments 에 넘길 클라이언트 — 저장소에 supabase-js 2.107(@pi/payments dev)·2.117(@pi/db)이 함께 설치돼 타입만 다르다(런타임 동일 객체)
// ponytail: 타입 단언, 버전 정렬(pnpm overrides 또는 peer 통일) 시 제거
export const payDb = () => db() as unknown as FlowInput['db']

// 목록·상세 공용 칼럼(R-P3 쓰는 것만) — 개최자 이름은 FK 임베디드 조인(smn_mst_sys_user_id_fkey)
export const SMN_COLS =
  'smn_id, smn_nm, subttl, start_dtm, max_cnt, ent_pi_amt, smn_sts_cd, hst_usr_id, plan_cd, sys_user!smn_mst_sys_user_id_fkey(display_name:dsp_nm, pi_username:pi_usr_nm)'

export interface SmnRow {
  smn_id: string
  smn_nm: string
  subttl: string | null
  start_dtm: string
  max_cnt: number
  ent_pi_amt: number | string
  smn_sts_cd: string
  hst_usr_id: string
  plan_cd: string
  sys_user: { display_name: string; pi_username: string | null } | null
}

// 응답용 — 개최자 표시명 평탄화(usr_id 는 본인 판정에만 쓰고 내보내지 않는다)
export const toCard = (r: SmnRow) => ({
  id: r.smn_id,
  title: smnTitle(r.smn_nm, r.subttl), // 표시용 룸 이름(섬 - 부제)
  island: r.smn_nm,
  subTitle: r.subttl ?? '',
  startAt: r.start_dtm,
  maxCnt: r.max_cnt,
  fee: Number(r.ent_pi_amt),
  plan: r.plan_cd, // 세미나 요금제 FREE·M·Y(sql/018) — 목록 배지·상세 표시
  status: r.smn_sts_cd,
  host: r.sys_user?.display_name || r.sys_user?.pi_username || '',
})

// SMN_ENT 검증기 — onSmn 으로 검증한 smn_id 를 라우트에 넘긴다(approve 뒤 fn_chk_smn_cap 호출용)
// 같은 대상 중복은 hasOtherApprovedPayment(대상 = 세미나 전체)가 아니라 sql/006 (usr_id, smn_id) 부분 유일 인덱스 + fn_chk_smn_cap 이 막는다
//  — 세미나는 여러 사람이 동시에 결제하므로 세미나 단위 1건 제한을 쓰면 안 된다
//  이전 결제 정리(보안 검토 S2) : 서명 전 이탈로 남은 내 APPROVED 결제가 sql/006 인덱스를 막으면 다시 결제할 수 없다 →
//  Pi 에서 취소·만료(404)면 원장 CANCELED, 아직 진행 중이면 ALREADY_PAID. 상한 STALE_LOOKUP_MAX 건, Pi 조회 병렬(R-P1)
export function smnValidators(onSmn: (smnId: string) => void): Validators {
  return {
    [SMN_ENT]: async ({ payment, user }) => {
      const smnId = payment.metadata?.smn_id
      if (!isUuid(smnId))
        return { ok: false, code: 'META_INVALID', status: 400 }
      const [smn, prev] = await Promise.all([
        db()
          .from('smn_mst')
          .select('ent_pi_amt, smn_sts_cd')
          .eq('smn_id', smnId)
          .eq('del_yn', 'N')
          .maybeSingle<{ ent_pi_amt: number | string; smn_sts_cd: string }>(),
        db()
          .from('pi_pymnt')
          .select('pymnt_id')
          .eq('usr_id', user.id)
          .eq('pymnt_tp_cd', SMN_ENT)
          .eq('pymnt_sts_cd', 'APPROVED')
          .eq('del_yn', 'N')
          .eq('meta_val->>smn_id', smnId)
          .neq('pymnt_id', payment.identifier)
          .limit(STALE_LOOKUP_MAX + 1),
      ])
      if (smn.error) throw smn.error
      if (prev.error) throw prev.error
      const data = smn.data
      // 없음·삭제 = 입장 불가와 같은 안내(U6) — NOT_FOUND 는 결제 불일치(PAY_MISMATCH)로 보여 혼란
      if (!data || !(OPEN_STS as readonly string[]).includes(data.smn_sts_cd))
        return { ok: false, code: 'SMN_CLOSED', status: 409 }
      if (!(Number(data.ent_pi_amt) > 0))
        return { ok: false, code: 'SMN_FREE', status: 400 }

      if (await staleBusy((prev.data ?? []).map((r) => r.pymnt_id as string), user.id))
        return { ok: false, code: 'ALREADY_PAID', status: 409 }

      onSmn(smnId)
      return { ok: true, amount: data.ent_pi_amt }
    },
    // 요금제(sql/015) — 금액 = 서버 견적 q(서명·만료·본인·요금제 일치)의 Pi 금액. 원화·클라이언트 금액 불신(memory krw-display-only-pay-pi)
    //  진행 중인 내 다른 SMN_PLAN 결제가 있으면 ALREADY_PAID(서명 전 이탈로 남은 것은 Pi 조회 후 정리 — SMN_ENT 와 같은 S2 규칙)
    [SMN_PLAN]: async ({ payment, user }) => {
      const v = verifyQuote(payment.metadata?.q, env.PI_SESSION_SECRET)
      if (!v.ok) return v.why === 'EXPIRED'
        ? { ok: false, code: 'QUOTE_EXPIRED', status: 409 }
        : { ok: false, code: 'META_INVALID', status: 400 }
      if (v.q.u !== user.id || v.q.p !== payment.metadata?.plan)
        return { ok: false, code: 'META_INVALID', status: 400 }
      if (await staleBusy(await otherPlanPays(user.id, payment.identifier), user.id))
        return { ok: false, code: 'ALREADY_PAID', status: 409 }
      return { ok: true, amount: v.q.a }
    },
  }
}

// 내 진행 중(APPROVED) 요금제 결제 ID — 견적 라우트·검증기 공용(상한 STALE_LOOKUP_MAX + 1, R-P3)
export async function otherPlanPays(usrId: string, exceptId?: string): Promise<string[]> {
  let q = db()
    .from('pi_pymnt')
    .select('pymnt_id')
    .eq('usr_id', usrId)
    .eq('pymnt_tp_cd', SMN_PLAN)
    .eq('pymnt_sts_cd', 'APPROVED')
    .eq('del_yn', 'N')
  if (exceptId) q = q.neq('pymnt_id', exceptId)
  const { data, error } = await q.limit(STALE_LOOKUP_MAX + 1)
  if (error) throw error
  return (data ?? []).map((r) => r.pymnt_id as string)
}

// 이전 APPROVED 결제 정리(보안 검토 S2) — Pi 에서 취소·만료(404)면 원장 CANCELED 후 false, 하나라도 진행 중이거나 상한 초과면 true(막는다).
//  Pi 조회 병렬(R-P1)
//  서명 없이 버려진 결제(abandoned)는 막지 않고 원장도 그대로 둔다(나중에 서명되면 정상 반영) — 취소·만료(gone)만 원장 CANCELED
export async function staleBusy(ids: string[], usrId: string): Promise<boolean> {
  if (ids.length > STALE_LOOKUP_MAX) return true
  const states = await Promise.all(ids.map(async (id) => stalePayState(await getPiPayment(id))))
  if (states.includes('pending')) return true
  await Promise.all(ids.filter((_, i) => states[i] === 'gone').map((id) => markPaymentCanceled(payDb(), id, usrId)))
  return false
}

type ApiCode = Parameters<typeof apiError>[0]

// PayFail → 응답. detail 은 서버 로그에만. 요금제 검증기 고유 코드(QUOTE_EXPIRED)는 그대로
export function payFail(where: string, f: PayFail) {
  if (f.detail) console.error(`[payments/${where}]`, f.code, f.detail)
  const code = f.code === 'QUOTE_EXPIRED' ? f.code : payErrorCode(f.code)
  return apiError(code as ApiCode, f.status)
}
