// 입장·요금제 결제 승인 — POST {paymentId}. Pi SDK onReadyForServerApproval 에서 piFetch 로 호출.
//  @pi/payments approvePayment(Pi GET → 결제자·방향 → SMN_ENT 검증기(DB 정가·상태) → 원장 APPROVED → Pi approve) 뒤
//  fn_chk_smn_cap(세미나 행 잠금, 사용자당 점유 1개·정원, PRD D-6) — OK 가 아니면 결제 취소(cancelPayment) 후 FULL·CLOSED·ALREADY 응답.
//  ⚠ 정원 확인이 Pi approve 뒤인 이유 : 패키지 흐름은 원장 기록과 Pi approve 사이에 끼울 자리가 없다. 서명 전이라 Pi cancel 가능.
//    Pi 가 취소를 거부(서명이 그 사이에 끝남)하면 원장 APPROVED 유지 → complete 가 등록 = 초과 1석(실무상 0, D-6 상한과 같은 성격)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { approvePayment, cancelPayment } from '@pi/payments'
import { apiError, db, dbFail, dbRoute, parseBody, requireUser } from '@/lib/api'
import { payDb, payFail, smnValidators } from '@/lib/seminar'
import { capError } from '@/lib/seminar-rules'

type ApiCode = Parameters<typeof apiError>[0]
const bodySchema = z.object({ paymentId: z.string().min(1).max(200) })

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    const [user, body] = await Promise.all([
      requireUser(req),
      parseBody(req, bodySchema),
    ])
    if (user instanceof NextResponse) return user
    if (body instanceof NextResponse) return body

    let smnId: string | null = null
    const r = await approvePayment({
      db: payDb(),
      user,
      paymentId: body.paymentId,
      validators: smnValidators((id) => (smnId = id)),
    })
    if (!r.ok) return payFail('approve', r)
    // 검증기는 SMN_ENT·SMN_PLAN 뿐 — smnId 가 없으면 요금제 결제(정원 확인 없음, sql/015)
    if (!smnId)
      return NextResponse.json({ ok: true, paymentId: r.paymentId }, { headers: { 'Cache-Control': 'no-store' } })

    const { data, error } = await db().rpc('fn_chk_smn_cap', {
      p_smn_id: smnId,
      p_usr_id: user.id,
      p_pymnt_id: body.paymentId,
    })
    // 정원 판정 불가·초과 — 서명 전에 결제를 되돌린다(취소 실패는 원장 APPROVED 유지, complete 가 마무리)
    const e = error ? null : capError(data as string)
    if (error || e) {
      const c = await cancelPayment({ db: payDb(), user, paymentId: body.paymentId })
      if (!c.ok) console.error('[payments/approve] 정원 초과 취소 실패', c.code)
      if (error) return dbFail(error)
      return apiError(e!.code as ApiCode, e!.status)
    }
    return NextResponse.json(
      { ok: true, paymentId: r.paymentId },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }),
)
