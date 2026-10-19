// 요금제 결제 준비 — POST { area_id, plan_cd, prd_cd } → { amount, memo, metadata } (서버가 금액·memo·metadata 결정, 클라이언트는 그대로 createPayment)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, dbError, parseBody } from '@/lib/api'
import { AREA_PLAN, payerAuth, planMemo, planPrice } from '@/lib/payments'

const body = z.object({ area_id: z.string().uuid(), plan_cd: z.enum(['P1', 'P2', 'P3', 'P4']), prd_cd: z.enum(['M', 'Y']) })

export async function POST(req: Request) {
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  const who = await payerAuth(b.area_id)
  if (who instanceof NextResponse) return who
  try {
    const amount = await planPrice(b.plan_cd, b.prd_cd)
    if (amount == null) return apiError('PAY_MISMATCH', 400)
    return NextResponse.json({ ok: true, amount, memo: planMemo(b), metadata: { type: AREA_PLAN, area_id: b.area_id, plan_cd: b.plan_cd, prd_cd: b.prd_cd } })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
