// 입장 결제 완료 — POST {paymentId, txid}. Pi SDK onReadyForServerCompletion·미완료 결제 복구(pi-auth-root)에서 piFetch 로 호출.
//  @pi/payments completePayment(원장 선조회 → Pi complete → txid 대조 → finalize) — SMN_ENT 는 finalize = fn_cmpl_smn_ent(sql/007) 로
//  원장 COMPLETED 와 참가 등록을 한 트랜잭션에(갈라짐 차단, 보안 검토 S1). 다른 유형은 원장 COMPLETED 만(markPaymentCompleted).
//  재호출(원장 이미 COMPLETED → 패키지가 finalize 를 다시 부르지 않음)은 fn_join_smn 으로 등록만 다시 시도(ALREADY 멱등)
//  결제 완료 후 등록 거부는 수동 환불 대상(D-7) — 로그
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { completePayment, markPaymentCompleted } from '@pi/payments'
import { apiError, db, dbFail, dbRoute, parseBody, requireUser } from '@/lib/api'
import { payDb, payFail, SMN_ENT } from '@/lib/seminar'
import { isUuid, joinError } from '@/lib/seminar-rules'

type ApiCode = Parameters<typeof apiError>[0]
type JoinRow = { rslt_cd: string; ptc_id: string | null }
const bodySchema = z.object({
  paymentId: z.string().min(1).max(200),
  txid: z.string().min(1).max(200),
})

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    const [user, body] = await Promise.all([
      requireUser(req),
      parseBody(req, bodySchema),
    ])
    if (user instanceof NextResponse) return user
    if (body instanceof NextResponse) return body

    const r = await completePayment<string | null>({
      db: payDb(),
      user,
      paymentId: body.paymentId,
      txid: body.txid,
      finalize: async ({ row, txid }) => {
        if (row.pymnt_tp_cd !== SMN_ENT) {
          const done = await markPaymentCompleted(payDb(), row.pymnt_id, user.id, txid)
          if (!done) throw new Error('원장 COMPLETED 0행')
          return null
        }
        const { data, error } = await db().rpc('fn_cmpl_smn_ent', {
          p_pymnt_id: row.pymnt_id,
          p_tx_id: txid,
          p_usr_id: user.id,
        })
        if (error) throw error
        return (data as JoinRow[] | null)?.[0]?.rslt_cd ?? null
      },
    })
    if (!r.ok) return payFail('complete', r)

    const smnId = r.row.meta_val?.smn_id
    if (r.row.pymnt_tp_cd !== SMN_ENT || !isUuid(smnId))
      return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })

    let rslt = r.result ?? null
    if (r.already) {
      const { data, error } = await db().rpc('fn_join_smn', {
        p_smn_id: smnId,
        p_usr_id: user.id,
        p_pymnt_id: body.paymentId,
      })
      if (error) {
        console.error('[payments/complete] 재호출 등록 실패(재시도 가능)', body.paymentId)
        return dbFail(error)
      }
      rslt = (data as JoinRow[] | null)?.[0]?.rslt_cd ?? null
    }
    const e = joinError(rslt)
    if (e) {
      console.error('[payments/complete] 결제 완료·등록 거부 — 수동 환불 확인', body.paymentId, rslt)
      return apiError(e.code as ApiCode, e.status)
    }
    return NextResponse.json(
      { ok: true, smnId },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }),
)
