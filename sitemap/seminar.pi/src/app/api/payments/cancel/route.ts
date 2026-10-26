// 입장 결제 취소 — POST {paymentId}. Pi SDK onCancel·onError·미완료 결제 복구(txid 없음)에서 piFetch 로 호출.
//  @pi/payments cancelPayment : 본인 APPROVED 만, Pi cancel 성공 시에만 원장 CANCELED(원장 없으면 Pi 결제자 확인 뒤 정리)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { cancelPayment } from '@pi/payments'
import { dbRoute, parseBody, requireUser } from '@/lib/api'
import { payDb, payFail } from '@/lib/seminar'

const bodySchema = z.object({ paymentId: z.string().min(1).max(200) })

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    const [user, body] = await Promise.all([
      requireUser(req),
      parseBody(req, bodySchema),
    ])
    if (user instanceof NextResponse) return user
    if (body instanceof NextResponse) return body
    const r = await cancelPayment({ db: payDb(), user, paymentId: body.paymentId })
    if (!r.ok) return payFail('cancel', r)
    return NextResponse.json(
      { ok: true, status: r.status },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }),
)
