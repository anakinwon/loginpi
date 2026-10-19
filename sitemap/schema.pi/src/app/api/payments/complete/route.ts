// 요금제 결제 완료 — POST { paymentId, txid }. SDK onReadyForServerCompletion·미완료 결제 복구에서 호출(piFetch)
//  settlePaid : 본인 원장 확인 → Pi 에 상태 조회(거래 ID 는 Pi 값) → Pi complete(이미 완료면 건너뜀) → 원장 COMPLETED + 요금제 반영(재호출 안전)
//  Pi 완료 뒤 DB 반영이 실패해도 원장이 APPROVED 로 남아 다시 호출하면 이어서 반영(검증 지적 M1)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, currentUser, dbError, parseBody } from '@/lib/api'
import { settlePaid } from '@/lib/payments'

const body = z.object({ paymentId: z.string().min(1).max(200), txid: z.string().min(1).max(200) }) // txid 는 받기만(검증·기록은 Pi 값)

export async function POST(req: Request) {
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  const user = await currentUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)
  try {
    const s = await settlePaid(b.paymentId, user.usr_id)
    if (!s.ok) return apiError(s.code, s.status)
    return NextResponse.json({ ok: true, plan_cd: s.plan_cd, end_dtm: s.end_dtm })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
