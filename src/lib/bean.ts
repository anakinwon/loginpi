import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'
import { TIP_PRESETS_BEAN, TIP_CUSTOM_MAX_BEAN } from './bean-shared'
import type { BeanTxn, BeanTxnType } from './bean-shared'

// Bean Token 경제 서버 전용 DB 접근 (PRD_16_TOKEN_MNG v1.2)
// 빈토큰지갑(bean_token_wallet): wallet_type=PLATFORM(발행 관리) / USER(사용자 보유)
// 소각 없음 — Bean은 USER↔PLATFORM 순환. 1 Pi = 100 Bean 고정·정수 전용.
// TODO: rename to bean_token_wallet (migration sql/069 적용 후)

export {
  BEAN_PER_PI,
  CHARGE_PRESETS,
  TIP_PRESETS_BEAN,
  beanToPi,
} from './bean-shared'
export type { BeanTxn, BeanTxnType } from './bean-shared'

interface TipCfgRow {
  tip1_bean: number
  tip2_bean: number
  tip3_bean: number
  custom_max_bean: number
}

// 선물 설정 = 고정 프리셋 3종 + 직접입력 상한(프리셋 4)
export interface TipConfig {
  presets: number[] // 고정 금액 버튼 3종
  customMax: number // 직접입력 송금 상한 (1~customMax)
}

const TIP_FALLBACK: TipConfig = {
  presets: [...TIP_PRESETS_BEAN],
  customMax: TIP_CUSTOM_MAX_BEAN,
}

// 카페방 P2P 선물 설정 — DB 최신행(bean_tip_cfg) 우선, 없거나 오류면 코드 상수 폴백.
// graceful: sql/109 미적용 시에도 선물 기능이 깨지지 않도록 항상 유효한 설정을 반환한다.
export async function getTipPresets(): Promise<TipConfig> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('bean_tip_cfg')
      .select('tip1_bean, tip2_bean, tip3_bean, custom_max_bean')
      .eq('del_yn', 'N')
      .order('reg_dtm', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !data) return TIP_FALLBACK
    const row = data as TipCfgRow
    return {
      presets: [
        Number(row.tip1_bean),
        Number(row.tip2_bean),
        Number(row.tip3_bean),
      ],
      customMax: Number(row.custom_max_bean),
    }
  } catch {
    return TIP_FALLBACK
  }
}

// 선물 설정 변경 — 새 행 INSERT(이력 보존, bean_supply_config 패턴). 호출 전 검증 필수.
export async function updateTipPresets(
  presets: [number, number, number],
  customMax: number,
  regrId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [a, b, c] = presets
  const { error } = await getSupabaseAdmin().from('bean_tip_cfg').insert({
    tip1_bean: a,
    tip2_bean: b,
    tip3_bean: c,
    custom_max_bean: customMax,
    note_txt: '관리자 수정',
    regr_id: regrId,
    modr_id: regrId,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

interface BeanWallet {
  bean_amt: number
}

// 내 Bean 잔액 — USER 지갑 없으면 0
export async function getBalance(usrId: string): Promise<number> {
  const { data } = await getSupabaseAdmin()
    .from('bean_token_wallet')
    .select('bean_amt')
    .eq('usr_id', usrId)
    .eq('wallet_type', 'USER')
    .eq('del_yn', 'N')
    .maybeSingle()
  return Number((data as BeanWallet | null)?.bean_amt ?? 0)
}

// 거래 내역 (최신순) — 페이지네이션 + 유형 필터 + 총건수
export async function listBeanTxns(
  usrId: string,
  opts: { limit?: number; offset?: number; type?: BeanTxnType } = {},
): Promise<{ txns: BeanTxn[]; total: number }> {
  const limit = opts.limit ?? 50
  const offset = opts.offset ?? 0
  let q = getSupabaseAdmin()
    .from('bean_txn')
    .select('txn_id, txn_tp_cd, bean_amt, bal_amt, pi_amt, memo_txt, reg_dtm', {
      count: 'exact',
    })
    .eq('usr_id', usrId)
    .eq('del_yn', 'N')
  if (opts.type) q = q.eq('txn_tp_cd', opts.type)
  const { data, count } = await q
    .order('reg_dtm', { ascending: false })
    .range(offset, offset + limit - 1)
  return { txns: (data as BeanTxn[] | null) ?? [], total: count ?? 0 }
}

// Bean 증감 원자적 적용 — fn_bean_apply에 위임 (원장 INSERT + 잔액 UPDATE 단일 트랜잭션)
// SPEND로 잔액 부족 시 fn이 INSUFFICIENT_BEAN 예외 → error 반환
export async function applyBean(args: {
  usrId: string
  txnTp: BeanTxnType
  beanAmt: number // 부호 있는 증감액 (충전 양수 / 사용 음수)
  piAmt?: number | null
  pymntId?: string | null
  refTp?: string | null
  refId?: string | null
  memo?: string | null
  regrId?: string
}): Promise<{ ok: boolean; balance?: number; error?: string }> {
  const { data, error } = await getSupabaseAdmin().rpc('fn_bean_apply', {
    p_usr_id: args.usrId,
    p_txn_tp: args.txnTp,
    p_bean_amt: args.beanAmt,
    p_pi_amt: args.piAmt ?? null,
    p_pymnt_id: args.pymntId ?? null,
    p_ref_tp: args.refTp ?? null,
    p_ref_id: args.refId ?? null,
    p_memo: args.memo ?? null,
    p_regr_id: args.regrId ?? 'SYSTEM',
  })

  if (error) {
    const insufficient = error.message?.includes('INSUFFICIENT_BEAN')
    console.error('[Bean] 적용 실패:', error.message)
    return { ok: false, error: insufficient ? 'INSUFFICIENT_BEAN' : 'ERROR' }
  }
  return { ok: true, balance: Number((data as BeanWallet)?.bean_amt ?? 0) }
}

// Bean P2P 전송 (USER→USER) — fn_bean_transfer에 위임 (양쪽 지갑 + 원장 2건 단일 트랜잭션)
// 거버넌스 무변동(순수 이전). 잔액 부족 시 INSUFFICIENT_BEAN 반환.
export async function transferBean(args: {
  fromUsrId: string
  toUsrId: string
  beanAmt: number // 양수 전송액
  refId?: string | null
  memo?: string | null
  regrId?: string
}): Promise<{ ok: boolean; fromBalance?: number; error?: string }> {
  const { data, error } = await getSupabaseAdmin().rpc('fn_bean_transfer', {
    p_from_usr: args.fromUsrId,
    p_to_usr: args.toUsrId,
    p_bean_amt: args.beanAmt,
    p_ref_id: args.refId ?? null,
    p_memo: args.memo ?? null,
    p_regr_id: args.regrId ?? 'SYSTEM',
  })

  if (error) {
    const msg = error.message ?? ''
    const known = ['INSUFFICIENT_BEAN', 'SELF_TRANSFER', 'INVALID_AMOUNT'].find(
      (e) => msg.includes(e),
    )
    console.error('[Bean] 전송 실패:', msg)
    return { ok: false, error: known ?? 'ERROR' }
  }
  const row = (Array.isArray(data) ? data[0] : data) as {
    out_from_bal: number
  } | null
  return { ok: true, fromBalance: Number(row?.out_from_bal ?? 0) }
}
