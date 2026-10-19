// 요금제 결제 준비 — POST { area_id, plan_cd, prd_cd(M 월·Y 년·U 업그레이드 일할계산) } → { amount, memo, metadata } (서버가 금액·memo·metadata 결정, 클라이언트는 그대로 createPayment)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, dbError, parseBody } from '@/lib/api'
import { AREA_PLAN, hasOtherApproved, payerAuth, planMemo, planPrice } from '@/lib/payments'
import { areaPlan, subscribed, upgradeQuotes } from '@/lib/plan'

const body = z.object({ area_id: z.string().uuid(), plan_cd: z.enum(['P1', 'P2', 'P3', 'P4']), prd_cd: z.enum(['M', 'Y', 'U']), prd: z.enum(['M', 'Y']).optional() }) // prd = 업그레이드 새 주기(U 만, 기본 월)

export async function POST(req: Request) {
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  const who = await payerAuth(b.area_id)
  if (who instanceof NextResponse) return who
  try {
    // 진행 중 결제 = 지갑을 열기 전에 거부(approve 에서 거부하면 Pi 지갑 화면에 가려 타임아웃으로만 보임, 운영 2026-10-19)
    if (await hasOtherApproved(b.area_id, '')) return apiError('PAY_DUP', 409)
    if (b.prd_cd === 'U') {
      const { from, quotes } = await upgradeQuotes(b.area_id)
      const q = quotes.find((x) => x.plan_cd === b.plan_cd && x.prd === (b.prd ?? 'M'))
      if (!q || from === 'FREE') return apiError('PAY_UPGRADE', 400)
      const meta = { type: AREA_PLAN, area_id: b.area_id, plan_cd: b.plan_cd, prd_cd: 'U' as const, from_plan: from, prd: q.prd }
      return NextResponse.json({ ok: true, amount: q.amount, memo: planMemo(meta), metadata: meta })
    }
    if (subscribed(await areaPlan(b.area_id))) return apiError('PAY_SUBSCRIBED', 409) // 구독 중 = 업그레이드만
    const amount = await planPrice(b.plan_cd, b.prd_cd)
    if (amount == null) return apiError('PAY_MISMATCH', 400)
    return NextResponse.json({ ok: true, amount, memo: planMemo(b), metadata: { type: AREA_PLAN, area_id: b.area_id, plan_cd: b.plan_cd, prd_cd: b.prd_cd } })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
