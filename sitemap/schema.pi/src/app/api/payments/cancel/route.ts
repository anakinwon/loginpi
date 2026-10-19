// 요금제 결제 취소 — POST { paymentId }. 사용자 취소·오류·서명 전 이탈·미완료 결제(txid 없음) 정리
//  본인 결제만(보안 리뷰 2026-10-19) : 원장 있음 = 본인 행만 / 원장 없음(approve 전 이탈) = Pi 조회로 결제자 uid 가 내 pi_uid 일 때만
//  서명된 결제는 취소하지 않고 완료 처리(검증 지적 M2 — 코인이 나갔는데 원장 CANCELED 방지), 원장 CANCELED 는 Pi 취소가 된 때만
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, currentUser, dbError, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { cancelPiPayment, getOwnPayment, getPiPayment, markCanceled, piCancelled, settlePaid } from '@/lib/payments'

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
    if (row) {
      // 서명됐으면 완료로 마무리
      const s = await settlePaid(b.paymentId, user.usr_id)
      if (s.ok) return NextResponse.json({ ok: true, completed: true, plan_cd: s.plan_cd, end_dtm: s.end_dtm })
      if (!s.unsigned) return apiError(s.code, s.status)
    } else {
      const [got, me] = await Promise.all([getPiPayment(b.paymentId), db().from('sys_user').select('pi_uid').eq('usr_id', user.usr_id).maybeSingle()])
      if (me.error) return dbError(me.error)
      if (!got.ok || !me.data?.pi_uid || got.payment.user_uid !== me.data.pi_uid) return apiError('PAY_MISMATCH', 403)
    }
    const c = await cancelPiPayment(b.paymentId) // Pi 측 pending 정리(남으면 다음 결제 거부)
    const canceled = c.ok || (await piCancelled(b.paymentId)) // 이미 취소된 결제(잔액 부족 등)는 취소 요청이 실패 → Pi 상태로 확인
    if (row && canceled) await markCanceled(b.paymentId, user.usr_id)
    return NextResponse.json({ ok: true, canceled })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
