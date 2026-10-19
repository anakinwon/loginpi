// 요금제 결제 완료 — POST { paymentId, txid }. SDK onReadyForServerCompletion·미완료 결제 복구에서 호출(piFetch)
//  원장 선조회(본인·취소 아님) → Pi complete → fn_cmpl_area_plan_pymnt(원장 COMPLETED + 기간 반영 한 트랜잭션, 재호출 = 같은 행)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, currentUser, dbError, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { completePiPayment, getOwnPayment } from '@/lib/payments'

const body = z.object({ paymentId: z.string().min(1).max(200), txid: z.string().min(1).max(200) })

export async function POST(req: Request) {
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  const user = await currentUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)
  try {
    const row = await getOwnPayment(b.paymentId, user.usr_id)
    if (!row || row.pymnt_sts_cd === 'CANCELED') return apiError('PAY_MISMATCH', 409) // 원장 없는 결제는 Pi complete 미호출
    if (row.pymnt_sts_cd !== 'COMPLETED') {
      const r = await completePiPayment(b.paymentId, b.txid)
      if (!r.ok) {
        if (r.status === 500) return apiError('PAY_PI_KEY', 500)
        console.error('[payments/complete] Pi complete', r.status, r.body.slice(0, 300))
        return apiError('PAY_PI_FAILED', 502)
      }
    }
    const { data, error } = await db().rpc('fn_cmpl_area_plan_pymnt', { p_pymnt_id: b.paymentId, p_tx_id: b.txid, p_usr_id: user.usr_id })
    if (error) {
      console.error('[payments/complete] RPC', error.code, error.message)
      return error.code === 'MPL01' ? apiError('PAY_MISMATCH', 409) : dbError(error)
    }
    const g = data as { plan_cd: string; end_dtm: string } | null
    return NextResponse.json({ ok: true, plan_cd: g?.plan_cd, end_dtm: g?.end_dtm })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
