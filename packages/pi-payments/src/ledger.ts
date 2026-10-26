// pi_pymnt 원장 함수(packages/pi-db/sql/010_pi_pymnt.sql) — 생성(APPROVED)·완료·취소 전이, 본인 행 조회, 진행 중 다른 결제 확인.
//  db 는 앱이 넘기는 service-role Supabase 클라이언트(@pi/db getSupabaseAdmin 또는 앱 스키마용). 물리 DELETE 없음
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PiPaymentDTO, PymntSts } from './core'

export interface PymntRow {
  pymnt_id: string
  usr_id: string
  pymnt_sts_cd: PymntSts
  pymnt_tp_cd: string
  meta_val: Record<string, unknown>
  tx_id: string | null
}

const ROW_COLS = 'pymnt_id, usr_id, pymnt_sts_cd, pymnt_tp_cd, meta_val, tx_id'

// 결제자 본인 행만(R-P3 쓰는 칼럼만)
export async function getOwnPayment(
  db: SupabaseClient,
  paymentId: string,
  userId: string,
): Promise<PymntRow | null> {
  const { data, error } = await db
    .from('pi_pymnt')
    .select(ROW_COLS)
    .eq('pymnt_id', paymentId)
    .eq('usr_id', userId)
    .eq('del_yn', 'N')
    .maybeSingle<PymntRow>()
  if (error) throw error
  return data
}

// PENDING → APPROVED 기록. 이미 있으면 덮지 않고 기존 행을 돌려준다(재호출 멱등 판정은 호출자)
export async function insertApprovedPayment(
  db: SupabaseClient,
  payment: PiPaymentDTO,
  userId: string,
  type: string,
): Promise<
  | { inserted: true }
  | { inserted: false; row: PymntRow | null }
  | { inserted: false; busy: true } // 대상 부분 유일 인덱스 위반(같은 대상 진행 중 결제) → 호출자가 ALREADY_PAID
> {
  const { data, error } = await db
    .from('pi_pymnt')
    .upsert(
      {
        pymnt_id: payment.identifier,
        usr_id: userId,
        pi_uid: payment.user_uid,
        pi_amt: payment.amount,
        memo_txt: payment.memo,
        meta_val: payment.metadata,
        pymnt_tp_cd: type,
        pymnt_sts_cd: 'APPROVED',
        regr_id: userId,
        modr_id: userId,
      },
      { onConflict: 'pymnt_id', ignoreDuplicates: true },
    )
    .select('pymnt_id')
  // 23505 = pymnt_id 외 유일 제약 위반(ON CONFLICT 는 pymnt_id 만) — approvedTargetIndexSql 인덱스가 막은 동시 approve
  if (error?.code === '23505') return { inserted: false, busy: true }
  if (error) throw error
  if (data && data.length > 0) return { inserted: true }
  // 충돌로 무시됨 — 다른 사용자 행일 수 있어 usr_id 조건 없이 조회
  const { data: row, error: e2 } = await db
    .from('pi_pymnt')
    .select(ROW_COLS)
    .eq('pymnt_id', payment.identifier)
    .maybeSingle<PymntRow>()
  if (e2) throw e2
  return { inserted: false, row }
}

// APPROVED → CANCELED. COMPLETED 는 건드리지 않음. 실패는 로깅만(Pi 취소 뒤라 응답을 바꾸지 않음)
//  actor = modr_id(본인 취소 userId, 크론 반려 'SYSTEM')
export async function markPaymentCanceled(
  db: SupabaseClient,
  paymentId: string,
  userId: string,
  actor: string = userId,
): Promise<boolean> {
  const { error } = await db
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
    console.error('[pi-payments] markPaymentCanceled', paymentId, error.message)
  return !error
}

// APPROVED → COMPLETED + tx_id. 도메인 반영을 한 트랜잭션에 묶어야 하면 앱 RPC(finalize)를 대신 쓴다
//  → 갱신된 행. 0행 갱신(동시 취소·이미 완료)이면 재조회해 같은 txid 의 COMPLETED 만 성공, 그 외 null(호출자가 INVALID_STATE)
export async function markPaymentCompleted(
  db: SupabaseClient,
  paymentId: string,
  userId: string,
  txid: string,
): Promise<PymntRow | null> {
  const { data, error } = await db
    .from('pi_pymnt')
    .update({
      pymnt_sts_cd: 'COMPLETED',
      tx_id: txid,
      cmpl_dtm: new Date().toISOString(),
      modr_id: userId,
    })
    .eq('pymnt_id', paymentId)
    .eq('usr_id', userId)
    .eq('pymnt_sts_cd', 'APPROVED')
    .select(ROW_COLS)
  if (error) throw error
  const updated = (data as PymntRow[] | null)?.[0]
  if (updated) return updated
  const row = await getOwnPayment(db, paymentId, userId)
  if (row?.pymnt_sts_cd === 'COMPLETED' && row.tx_id === txid) return row
  console.error(
    '[pi-payments] markPaymentCompleted 0행',
    paymentId,
    row?.pymnt_sts_cd ?? 'NONE',
  )
  return null
}

const META_KEY = /^[a-z_][a-z0-9_]{0,62}$/

// 같은 대상(meta_val->>metaKey = metaValue)에 진행 중(APPROVED) 인 다른 결제가 있는지 — 이중 결제 방지
//  metaKey 는 PostgREST 필터 경로에 들어가므로 식별자 형식만 허용. 대량이면 sitemap.pi sql/012 처럼 식 부분 인덱스를 앱이 둔다
export async function hasOtherApprovedPayment(
  db: SupabaseClient,
  opts: {
    types: readonly string[]
    metaKey: string
    metaValue: string
    exceptPaymentId: string
  },
): Promise<boolean> {
  if (!META_KEY.test(opts.metaKey))
    throw new Error(`metaKey 형식 오류: ${opts.metaKey}`)
  // 존재 여부만 — 건수 대신 1행(R-P3)
  const { data, error } = await db
    .from('pi_pymnt')
    .select('pymnt_id')
    .in('pymnt_tp_cd', [...opts.types])
    .eq('pymnt_sts_cd', 'APPROVED')
    .eq('del_yn', 'N')
    .eq(`meta_val->>${opts.metaKey}`, opts.metaValue)
    .neq('pymnt_id', opts.exceptPaymentId)
    .limit(1)
  if (error) throw error
  return (data?.length ?? 0) > 0
}

const TP_CD = /^[A-Z][A-Z0-9_]{0,19}$/ // pymnt_tp_cd VARCHAR(20)

// R-P5 — 같은 대상에 APPROVED 1건만 허용하는 부분 유일 인덱스 DDL(앱 sql/ 에 붙여 넣는다).
//  hasOtherApprovedPayment(조회→기록 2단계)만으론 동시 approve 2건이 둘 다 통과한다 → DB 가 최종 차단, insertApprovedPayment 가 23505 → busy
//  types 여러 개 = 그 유형들끼리도 같은 대상 1건(hasOtherApprovedPayment 의 types 와 같게). meta 값이 없는 행은 NULL 이라 충돌 안 함
export function approvedTargetIndexSql(opts: {
  nn: string // x_pi_pymnt_NN 의 NN(앱 DB 안에서 겹치지 않게)
  metaKey: string
  types: readonly string[]
}): string {
  if (!/^\d{2}$/.test(opts.nn)) throw new Error(`nn 형식 오류: ${opts.nn}`)
  if (!META_KEY.test(opts.metaKey))
    throw new Error(`metaKey 형식 오류: ${opts.metaKey}`)
  if (opts.types.length === 0 || !opts.types.every((t) => TP_CD.test(t)))
    throw new Error(`types 형식 오류: ${opts.types.join(',')}`)
  const types = opts.types.map((t) => `'${t}'`).join(', ')
  return [
    `-- DA-APPROVED: <승인 근거·일자> — pi_pymnt 대상(${opts.metaKey}) 진행 중 결제 1건 제한(@pi/payments approvedTargetIndexSql)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS x_pi_pymnt_${opts.nn}`,
    `  ON pi_pymnt ((meta_val ->> '${opts.metaKey}'))`,
    `  WHERE pymnt_sts_cd = 'APPROVED' AND del_yn = 'N' AND pymnt_tp_cd IN (${types});`,
  ].join('\n')
}
