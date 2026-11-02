// 요금제 결제 승인 — POST { paymentId }. Pi SDK onReadyForServerApproval 에서 piFetch 로 호출.
//  @pi/payments approvePayment : Pi GET → 결제자·방향 → DBM_PLAN 검증기(서명 견적·결제자·진행 중 결제·원화 기준가 재계산) → 원장 APPROVED → Pi approve
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { approvePayment } from '@pi/payments'
import { dbRoute, parseBody, requireUser } from '@/lib/api'
import { payFail } from '@/lib/pay-fail'
import { payDb, planValidators } from '@/lib/plan-pay'

const bodySchema = z.object({ paymentId: z.string().min(1).max(200) })

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    const [user, body] = await Promise.all([requireUser(req), parseBody(req, bodySchema)])
    if (user instanceof NextResponse) return user
    if (body instanceof NextResponse) return body
    const r = await approvePayment({ db: payDb(), user, paymentId: body.paymentId, validators: planValidators(user) })
    if (!r.ok) return payFail('approve', r)
    return NextResponse.json({ ok: true, paymentId: r.paymentId }, { headers: { 'Cache-Control': 'no-store' } })
  }),
)
