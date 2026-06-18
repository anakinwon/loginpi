import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'
import type { BeanTxn, BeanTxnType } from './bean-shared'

// Bean Token 경제 서버 전용 DB 접근 (PRD_16_TOKEN_MNG v1.2)
// 빈토큰지갑(bean_token_wallet): wallet_type=PLATFORM(발행 관리) / USER(사용자 보유)
// 소각 없음 — Bean은 USER↔PLATFORM 순환. 1 Pi = 100 Bean 고정·정수 전용.
// TODO: rename to bean_token_wallet (migration sql/069 적용 후)

export { BEAN_PER_PI, CHARGE_PRESETS, beanToPi } from './bean-shared'
export type { BeanTxn, BeanTxnType } from './bean-shared'

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

// 거래 내역 (최신순)
export async function listBeanTxns(
  usrId: string,
  limit = 50,
): Promise<BeanTxn[]> {
  const { data } = await getSupabaseAdmin()
    .from('bean_txn')
    .select('txn_id, txn_tp_cd, bean_amt, bal_amt, pi_amt, memo_txt, reg_dtm')
    .eq('usr_id', usrId)
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })
    .limit(limit)
  return (data as BeanTxn[] | null) ?? []
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
