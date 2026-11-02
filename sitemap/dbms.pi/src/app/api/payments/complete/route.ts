// 요금제 결제 완료 — POST { paymentId, txid }. Pi SDK onReadyForServerCompletion·미완료 결제 복구(pi-auth-root)에서 piFetch 로 호출.
//  @pi/payments completePayment(본인 원장 선조회 → Pi complete → txid 대조) → finalize = fn_cmpl_dbm_lnk_plan(sql/035 — 원장 COMPLETED + 기간 반영 한 트랜잭션, 재호출 멱등)
//  반영 실패 = 원장 APPROVED 유지 → 다시 호출하면 이어서 반영. 돈은 받았는데 반영 불가(MPL01)는 수동 확인 로그
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { completePayment } from '@pi/payments'
import { db, dbRoute, parseBody, requireUser } from '@/lib/api'
import { payFail } from '@/lib/pay-fail'
import { payDb } from '@/lib/plan-pay'
import { DBM_PLAN } from '@/lib/plan-rules'

const bodySchema = z.object({ paymentId: z.string().min(1).max(200), txid: z.string().min(1).max(200) })

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    const [user, body] = await Promise.all([requireUser(req), parseBody(req, bodySchema)])
    if (user instanceof NextResponse) return user
    if (body instanceof NextResponse) return body
    const r = await completePayment<{ plan_cd: string; end_dtm: string } | null>({
      db: payDb(),
      user,
      paymentId: body.paymentId,
      txid: body.txid,
      finalize: async ({ row, txid }) => {
        if (row.pymnt_tp_cd !== DBM_PLAN) throw new Error(`다른 결제 유형 ${row.pymnt_tp_cd}`)
        const { data, error } = await db().rpc('fn_cmpl_dbm_lnk_plan', { p_pymnt_id: row.pymnt_id, p_tx_id: txid, p_usr_id: user.id })
        if (error) {
          console.error('[payments/complete] 요금제 반영 실패 — 수동 확인', row.pymnt_id, error.code, error.message)
          throw error
        }
        const d = data as { plan_cd: string; end_dtm: string } | null
        return d ? { plan_cd: d.plan_cd, end_dtm: d.end_dtm } : null
      },
    })
    if (!r.ok) return payFail('complete', r)
    return NextResponse.json({ ok: true, plan: r.result ?? null }, { headers: { 'Cache-Control': 'no-store' } })
  }),
)
