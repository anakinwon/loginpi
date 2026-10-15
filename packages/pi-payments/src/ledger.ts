// @pi/payments pi_pymnt 원장 — 본인 결제 조회·취소 전이. DB 클라이언트는 사이트가 주입(사이트별 Supabase 프로젝트·스키마, PRD_28 §5)
// 출처 : sitemap.pi src/lib/payments.ts(2026-10-15 추출, 쿼리 동일)
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PymntRow {
  pymnt_id: string
  usr_id: string
  pymnt_sts_cd: 'APPROVED' | 'COMPLETED' | 'CANCELED'
  pymnt_tp_cd: string // SITE_REG | SITE_SPK — complete 가 RPC 를 고른다
  meta_val: Record<string, unknown>
}

export function createLedger(db: () => SupabaseClient) {
  // 원장 조회(결제자 본인 행만)
  async function getOwnPayment(
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

  // 원장 상태 전이(취소) — COMPLETED 는 건드리지 않는다. 갱신 실패는 로깅(호출자는 Pi 취소가 끝난 뒤라 응답을 바꾸지 않음)
  //  actor : modr_id 기록 주체 — 본인 취소는 userId, 크론 미결제 반려는 'SYSTEM'
  async function markPaymentCanceled(
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
  return { getOwnPayment, markPaymentCanceled }
}
