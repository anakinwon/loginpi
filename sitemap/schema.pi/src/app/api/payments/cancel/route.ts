// 요금제 결제 취소 — POST { paymentId }. 사용자 취소·오류·서명 전 이탈·미완료 결제(txid 없음) 정리
//  본인 결제만 취소(보안 리뷰 2026-10-19 — 남의 진행 중 결제 ID 로 취소 차단) :
//   원장 있음 = 본인·APPROVED 행만 / 원장 없음(approve 전 이탈) = Pi 조회로 결제자 uid 가 내 pi_uid 일 때만. COMPLETED 는 그대로
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, currentUser, dbError, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { cancelPiPayment, getOwnPayment, getPiPayment, markCanceled } from '@/lib/payments'

const body = z.object({ paymentId: z.string().min(1).max(200) })

export async function POST(req: Request) {
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  const user = await currentUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)
  try {
    const row = await getOwnPayment(b.paymentId, user.usr_id)
    if (row?.pymnt_sts_cd === 'COMPLETED') return NextResponse.json({ ok: true, completed: true })
    if (row?.pymnt_sts_cd === 'CANCELED') return NextResponse.json({ ok: true })
    if (!row) {
      const [got, me] = await Promise.all([getPiPayment(b.paymentId), db().from('sys_user').select('pi_uid').eq('usr_id', user.usr_id).maybeSingle()])
      if (me.error) return dbError(me.error)
      if (!got.ok || !me.data?.pi_uid || got.payment.user_uid !== me.data.pi_uid) return apiError('PAY_MISMATCH', 403)
    }
    await cancelPiPayment(b.paymentId).catch(() => undefined) // Pi 측 pending 정리(남으면 다음 결제 거부)
    if (row) await markCanceled(b.paymentId, user.usr_id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
