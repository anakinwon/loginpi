// 결제 승인 — POST /api/payments/approve { paymentId }. Pi SDK onReadyForServerApproval 에서 호출(piFetch).
//  순서: 세션 → Pi API approve → metadata(SITE_REG) 검증 → 사이트 소유·미결제 확인 → 정가 ≥ 검증 → pi_pymnt APPROVED upsert.
//  검증 실패 시 Pi 측 결제는 approve 됐지만 우리 원장엔 남기지 않는다(complete 단계에서도 다시 막힘) — 사용자 지갑 차감은 complete 전엔 없음
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
import { approvePiPayment, getRegFee, parseSiteRegMeta } from '@/lib/payments'

const bodySchema = z.object({ paymentId: z.string().min(1).max(200) })

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    const user = await requireUser(req)
    if (user instanceof NextResponse) return user
    const body = await parseBody(req, bodySchema)
    if (body instanceof NextResponse) return body

    const r = await approvePiPayment(body.paymentId)
    if (!r.ok && !r.alreadyApproved) {
      if (r.status === 500) return apiError('SERVER_CONFIG', 500)
      console.error('[payments/approve] Pi API', r.status, r.body.slice(0, 300))
      return apiError('PAY_PI_APPROVE_FAILED', 502)
    }
    const payment = r.ok ? r.payment : r.alreadyApproved!

    const meta = parseSiteRegMeta(payment.metadata)
    if (!meta) return apiError('PAY_SITE_MISMATCH', 400)
    if (user.pi_uid && payment.user_uid !== user.pi_uid)
      return apiError('PAY_SITE_MISMATCH', 403)

    const { data: site, error } = await db()
      .from('site_mst')
      .select('site_id, plan_cd, pymnt_id, own_site_yn')
      .eq('site_id', meta.site_id)
      .eq('ownr_usr_id', user.id)
      .eq('del_yn', 'N')
      .maybeSingle<{
        site_id: string
        plan_cd: string
        pymnt_id: string | null
        own_site_yn: 'Y' | 'N'
      }>()
    if (error) return dbFail(error)
    if (!site || site.own_site_yn === 'Y')
      return apiError('PAY_SITE_MISMATCH', 400)
    if (site.pymnt_id && site.pymnt_id !== payment.identifier)
      return apiError('PAY_ALREADY_PAID', 409)

    const fee = await getRegFee(meta.plan_cd)
    if (!fee || fee.pi_amt <= 0) return apiError('PAY_NOT_REQUIRED', 409)
    if (Number(payment.amount) + 1e-6 < fee.pi_amt)
      return apiError('PAY_AMOUNT_SHORT', 400)

    const { error: upErr } = await db().from('pi_pymnt').upsert(
      {
        pymnt_id: payment.identifier,
        usr_id: user.id,
        pi_uid: payment.user_uid,
        pi_amt: payment.amount,
        memo_txt: payment.memo,
        meta_val: payment.metadata,
        pymnt_tp_cd: meta.type,
        pymnt_sts_cd: 'APPROVED',
        regr_id: user.id,
        modr_id: user.id,
      },
      { onConflict: 'pymnt_id', ignoreDuplicates: true },
    )
    if (upErr) return dbFail(upErr)
    return NextResponse.json({ ok: true, paymentId: payment.identifier })
  }),
)
