// 결제 취소 — POST /api/payments/cancel { paymentId }. SDK onCancel/onError·서명 전 이탈 복구(txid 없는 미완료 결제)에서 호출(piFetch).
//  본인 APPROVED 결제만, **Pi API cancel 이 성공했을 때만** CANCELED 로 — 서명 뒤 거래 진행 중이면 Pi 가 취소를 거부하므로 원장을 CANCELED 로 바꾸면
//  complete 가 409 로 막혀 "돈은 나갔는데 기록 없음"이 된다(검증 지적). COMPLETED 는 건드리지 않음
//  원장에 없는 결제(approve 전 취소)는 Pi 조회로 결제자(user_uid)가 세션 사용자인지 확인한 뒤에만 Pi cancel — 임의 paymentId 로 타인 결제 취소(IDOR) 차단
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { apiError, dbFail, dbRoute, parseBody, requireUser } from '@/lib/api'
import {
  cancelPiPayment,
  getOwnPayment,
  getPiPayment,
  markPaymentCanceled,
} from '@/lib/payments'

const bodySchema = z.object({ paymentId: z.string().min(1).max(200) })

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    const user = await requireUser(req)
    if (user instanceof NextResponse) return user
    const body = await parseBody(req, bodySchema)
    if (body instanceof NextResponse) return body

    let row
    try {
      row = await getOwnPayment(body.paymentId, user.id)
    } catch (e) {
      return dbFail(e as { code?: string; message?: string })
    }
    if (!row) {
      // 원장 없음(approve 전 취소) — Pi 측 결제자가 본인일 때만 정리(다음 결제 생성 가능하게). 아니면 존재 자체를 숨김
      const got = await getPiPayment(body.paymentId)
      if (!got.ok || !user.pi_uid || got.payment.user_uid !== user.pi_uid)
        return apiError('NOT_FOUND', 404)
      await cancelPiPayment(body.paymentId).catch(() => undefined)
      return NextResponse.json({ ok: true, status: 'NONE' })
    }
    if (row.pymnt_sts_cd === 'COMPLETED') return apiError('PAY_ALREADY_PAID', 409)
    if (row.pymnt_sts_cd === 'CANCELED') {
      // 원장은 이미 취소 — Pi 측 pending 이 남았을 수 있어 한 번 더 정리(best-effort)
      await cancelPiPayment(body.paymentId).catch(() => undefined)
      return NextResponse.json({ ok: true, status: 'CANCELED' })
    }
    const r = await cancelPiPayment(body.paymentId)
    if (!r.ok) {
      // Pi 가 취소 거부(서명 완료·거래 진행 중 등) — 원장은 APPROVED 유지, 이후 complete(미완료 결제 복구)가 마무리한다
      console.error('[payments/cancel] Pi cancel', r.status, r.body.slice(0, 300))
      return apiError('PAY_PI_CANCEL_FAILED', 409)
    }
    await markPaymentCanceled(body.paymentId, user.id)
    return NextResponse.json({ ok: true, status: 'CANCELED' })
  }),
)
