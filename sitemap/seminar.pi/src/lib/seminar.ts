// 세미나 서버 공용 — 목록·상세 조회 칼럼, 입장 결제(SMN_ENT) 검증기, @pi/payments 실패 → apiError 응답.
// 검증기는 서버 DB 의 smn_mst.ent_pi_amt 로 정가를 재계산한다(클라이언트 금액 불신, PRD D-5·D-10)
import 'server-only'
import {
  getPiPayment,
  markPaymentCanceled,
  type FlowInput,
  type PayFail,
  type Validators,
} from '@pi/payments'
import { apiError, db } from './api'
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
  'smn_id, smn_nm, subttl, start_dtm, max_cnt, ent_pi_amt, smn_sts_cd, hst_usr_id, sys_user(display_name:dsp_nm, pi_username:pi_usr_nm)'

export interface SmnRow {
  smn_id: string
  smn_nm: string
  subttl: string | null
  start_dtm: string
  max_cnt: number
  ent_pi_amt: number | string
  smn_sts_cd: string
  hst_usr_id: string
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

      const ids = (prev.data ?? []).map((r) => r.pymnt_id as string)
      if (ids.length > STALE_LOOKUP_MAX)
        return { ok: false, code: 'ALREADY_PAID', status: 409 }
      const states = await Promise.all(
        ids.map(async (id) => stalePayState(await getPiPayment(id))),
      )
      if (states.includes('pending'))
        return { ok: false, code: 'ALREADY_PAID', status: 409 }
      await Promise.all(ids.map((id) => markPaymentCanceled(payDb(), id, user.id)))

      onSmn(smnId)
      return { ok: true, amount: data.ent_pi_amt }
    },
  }
}

type ApiCode = Parameters<typeof apiError>[0]

// PayFail → 응답. detail 은 서버 로그에만
export function payFail(where: string, f: PayFail) {
  if (f.detail) console.error(`[payments/${where}]`, f.code, f.detail)
  return apiError(payErrorCode(f.code) as ApiCode, f.status)
}
