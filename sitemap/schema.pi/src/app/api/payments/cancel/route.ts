// 요금제 결제 취소 — POST { paymentId }. 사용자 취소·오류·서명 전 이탈·미완료 결제(txid 없음) 정리. 본인 원장만 CANCELED(COMPLETED 는 그대로)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, currentUser, dbError, parseBody } from '@/lib/api'
import { cancelPiPayment, getOwnPayment, markCanceled } from '@/lib/payments'

const body = z.object({ paymentId: z.string().min(1).max(200) })

export async function POST(req: Request) {
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  const user = await currentUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)
  try {
    const row = await getOwnPayment(b.paymentId, user.usr_id)
    if (row?.pymnt_sts_cd === 'COMPLETED') return NextResponse.json({ ok: true, completed: true })
    await cancelPiPayment(b.paymentId).catch(() => undefined) // Pi 측 pending 정리(남으면 다음 결제 거부)
    if (row) await markCanceled(b.paymentId, user.usr_id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
