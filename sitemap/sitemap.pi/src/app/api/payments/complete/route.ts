// 결제 완료 — POST /api/payments/complete { paymentId, txid }. Pi SDK onReadyForServerCompletion(및 미완료 결제 복구)에서 호출(piFetch).
//  Pi API complete → fn_cmpl_site_reg_pymnt(한 트랜잭션: pi_pymnt COMPLETED + site_mst.pymnt_id/pay_dtm/plan_cd). 재호출 멱등
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
import { completePiPayment } from '@/lib/payments'
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

    const r = await completePiPayment(body.paymentId, body.txid)
    if (!r.ok) {
      if (r.status === 500) return apiError('SERVER_CONFIG', 500)
      console.error(
        '[payments/complete] Pi API',
        r.status,
        r.body.slice(0, 300),
      )
      return apiError('PAY_PI_COMPLETE_FAILED', 502)
    }

    const { data, error } = await db().rpc('fn_cmpl_site_reg_pymnt', {
      p_pymnt_id: body.paymentId,
      p_tx_id: body.txid,
    })
    if (error) {
      // P0002 결제 없음(approve 미기록) · P0003 사이트 불일치/이미 다른 결제 — 운영자 확인 대상이라 로그
      console.error('[payments/complete] RPC', error.code, error.message)
      if (error.code === 'P0002' || error.code === 'P0003')
        return apiError('PAY_SITE_MISMATCH', 409)
      return dbFail(error)
    }
    const site = data as Record<string, unknown> | null
    if (!site?.site_id || (site.ownr_usr_id as string) !== user.id)
      return apiError('PAY_SITE_MISMATCH', 409)

    // 소유자 응답 컬럼만 돌려준다(비공개 연락처 포함은 본인이므로 허용)
    const cols = OWNER_SITE_COLS.split(',').map((c) => c.trim())
    const out: Record<string, unknown> = {}
    for (const c of cols) out[c] = site[c]
    return NextResponse.json({ ok: true, site: out })
  }),
)
