// 입장 결제 완료 — POST {paymentId, txid}. Pi SDK onReadyForServerCompletion·미완료 결제 복구(pi-auth-root)에서 piFetch 로 호출.
//  @pi/payments completePayment(원장 선조회 → Pi complete → txid 대조 → 원장 COMPLETED) 뒤 fn_join_smn(smn_id, usr_id, pymnt_id) 로 참가 등록.
//  finalize 를 쓰지 않는 이유 : fn_join_smn 은 원장 COMPLETED 를 전제로 재검증하고, 패키지는 이미 COMPLETED 인 재호출에 finalize 를 다시 부르지 않는다.
//  → 성공·재호출(already) 모두 등록을 다시 시도한다(fn_join_smn 은 ALREADY 로 멱등). 결제 완료 후 등록 실패는 수동 환불 대상(D-7) — 로그
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { completePayment } from '@pi/payments'
import { apiError, db, dbFail, dbRoute, parseBody, requireUser } from '@/lib/api'
import { payDb, payFail, SMN_ENT } from '@/lib/seminar'
import { isUuid, joinError } from '@/lib/seminar-rules'

type ApiCode = Parameters<typeof apiError>[0]
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

    const r = await completePayment({
      db: payDb(),
      user,
      paymentId: body.paymentId,
      txid: body.txid,
    })
    if (!r.ok) return payFail('complete', r)

    const smnId = r.row.meta_val?.smn_id
    if (r.row.pymnt_tp_cd !== SMN_ENT || !isUuid(smnId))
      return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })

    const { data, error } = await db()
      .rpc('fn_join_smn', {
        p_smn_id: smnId,
        p_usr_id: user.id,
        p_pymnt_id: body.paymentId,
      })
    if (error) {
      console.error('[payments/complete] 결제 완료 후 등록 실패(재시도 가능)', body.paymentId)
      return dbFail(error)
    }
    const res = (data as { rslt_cd: string }[] | null)?.[0]
    const e = joinError(res?.rslt_cd)
    if (e) {
      console.error('[payments/complete] 결제 완료·등록 거부 — 수동 환불 확인', body.paymentId, res?.rslt_cd)
      return apiError(e.code as ApiCode, e.status)
    }
    return NextResponse.json(
      { ok: true, smnId },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }),
)
