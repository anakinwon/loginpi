// 요금제 결제 준비 — POST { linkId, plan_cd(D1~D3), prd_cd(M 월·Y 년·U 업그레이드), prd?(업그레이드 새 주기) } → { amount, memo, metadata, krw, bndl }
//  서버가 금액·memo·metadata(서명 견적 q, 10분)를 정한다 — 원화 기준가(sql/035) → 묶음 할인(schema.pi P4 기간 안 20%) → Pi 시세 환산(0.01 올림). 클라이언트는 그대로 createPayment
//  결제자 = 연결 소유자 또는 ADMIN(requireLink). 진행 중 결제가 있으면 지갑을 열기 전에 거부(R-P5). 시세 실패 = 503(추정 금지)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { env } from '@/env'
import { apiError, dbRoute, parseBody } from '@/lib/api'
import { linkAreaPlan, requireLink } from '@/lib/link/client'
import { feeRows, piRates, planTerms } from '@/lib/plan'
import { baseKrw, otherPlanPays, staleBusy } from '@/lib/plan-pay'
import { signQuote } from '@/lib/plan-quote'
import { bundleOk, DBM_PLAN, krwDue, metaKey, piAmount, planMemo, QUOTE_TTL_MS, type PlanMeta } from '@/lib/plan-rules'

type ApiCode = Parameters<typeof apiError>[0]
const bodySchema = z.object({
  linkId: z.string().uuid(),
  plan_cd: z.enum(['D1', 'D2', 'D3']),
  prd_cd: z.enum(['M', 'Y', 'U']),
  prd: z.enum(['M', 'Y']).optional(),
})

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    const b = await parseBody(req, bodySchema)
    if (b instanceof NextResponse) return b
    const ctx = await requireLink(req, b.linkId, 'ANY')
    if (ctx instanceof Response) return ctx as NextResponse
    // R-P1 — 기간·요금표·시세·묶음 할인·진행 중 결제는 서로 독립
    const [terms, rows, rates, area, others] = await Promise.all([
      planTerms(b.linkId),
      feeRows(),
      piRates(),
      linkAreaPlan(b.linkId),
      otherPlanPays(b.linkId),
    ])
    if (await staleBusy(others, ctx.usrId)) return apiError('PAY_ALREADY_PAID', 409)
    const base = baseKrw(b, ctx.plan, terms, rows, Date.now())
    if (!base.ok) return apiError(base.code as ApiCode, base.code === 'NOT_FOUND' ? 404 : 409)
    const bndl = bundleOk(area)
    const due = krwDue(base.krw, bndl)
    const amount = due && rates ? piAmount(due, rates.krw) : null
    if (!amount) return apiError('PRICE_UNAVAILABLE', 503)
    const meta: Omit<PlanMeta, 'q'> = {
      type: DBM_PLAN,
      lnk_id: b.linkId,
      plan_cd: b.plan_cd,
      prd_cd: b.prd_cd,
      from_plan: ctx.plan.plan,
      prd: base.prd,
      pre: base.pre,
      bndl,
    }
    const q = signQuote({ u: ctx.usrId, m: metaKey(meta), k: base.krw, a: amount, e: Date.now() + QUOTE_TTL_MS }, env.PI_SESSION_SECRET)
    return NextResponse.json(
      { amount: Number(amount), memo: planMemo(meta), metadata: { ...meta, q }, krw: due, bndl },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }),
)
