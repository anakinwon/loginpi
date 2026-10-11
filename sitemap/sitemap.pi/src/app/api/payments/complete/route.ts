// 결제 완료 — POST /api/payments/complete { paymentId, txid }. Pi SDK onReadyForServerCompletion(및 미완료 결제 복구)에서 호출(piFetch).
//  순서(2026-10-11 적대적 검증 반영) : 세션 → **원장 선조회**(결제자 본인·APPROVED/COMPLETED, 아니면 Pi 호출 없이 409) → Pi API complete
//   → fn_cmpl_site_reg_pymnt(p_usr_id 포함, 한 트랜잭션 : pi_pymnt COMPLETED + site_mst.pymnt_id/pay_dtm/plan_cd). 재호출 멱등
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import {
  apiError,
  db,
  dbFail,
  dbRoute,
  parseBody,
  requireUser,
} from '@/lib/api'
import { completePiPayment, getOwnPayment } from '@/lib/payments'
import { OWNER_SITE_COLS } from '@/lib/site'

const bodySchema = z.object({
  paymentId: z.string().min(1).max(200),
  txid: z.string().min(1).max(200),
})

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    const user = await requireUser(req)
    if (user instanceof NextResponse) return user
    const body = await parseBody(req, bodySchema)
    if (body instanceof NextResponse) return body

    // 1) 원장 선조회 — approve 가 기록한 본인 결제만 완료 처리(타인 paymentId·txid 재생 차단, 원장 없는 결제는 Pi complete 미호출)
    let row
    try {
      row = await getOwnPayment(body.paymentId, user.id)
    } catch (e) {
      return dbFail(e as { code?: string; message?: string })
    }
    if (!row || row.pymnt_sts_cd === 'CANCELED')
      return apiError('PAY_SITE_MISMATCH', 409)

    // 2) Pi complete
    const r = await completePiPayment(body.paymentId, body.txid)
    if (!r.ok) {
      if (r.status === 500) return apiError('SERVER_CONFIG', 500)
      console.error('[payments/complete] Pi API', r.status, r.body.slice(0, 300))
      return apiError('PAY_PI_COMPLETE_FAILED', 502)
    }

    // 3) 원장 COMPLETED + 사이트 결제 기록(한 트랜잭션)
    const { data, error } = await db().rpc('fn_cmpl_site_reg_pymnt', {
      p_pymnt_id: body.paymentId,
      p_tx_id: body.txid,
      p_usr_id: user.id,
    })
    if (error) {
      // P0002 결제 없음/결제자 불일치 · P0003 사이트 불일치·결제 불가 상태·이미 다른 결제 — 운영자 확인 대상
      console.error('[payments/complete] RPC', error.code, error.message)
      if (error.code === 'P0002' || error.code === 'P0003')
        return apiError('PAY_SITE_MISMATCH', 409)
      return dbFail(error)
    }
    const site = data as Record<string, unknown> | null
    if (!site?.site_id) return apiError('PAY_SITE_MISMATCH', 409)

    const cols = OWNER_SITE_COLS.split(',').map((c) => c.trim())
    const out: Record<string, unknown> = {}
    for (const c of cols) out[c] = site[c]
    return NextResponse.json({ ok: true, site: out })
  }),
)
