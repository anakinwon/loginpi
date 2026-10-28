// 개최자 요금제 API(sql/015) — GET = 가격표(원화 참고 + 현재 Pi 견적 참고값) + 로그인 시 내 남은 시간, POST {plan} = 결제 견적(서명 10분).
//  원화는 표시용, 결제 금액은 서버가 시세로 환산·서명한 Pi 금액만(memory krw-display-only-pay-pi). 시세 실패 = 견적 503(추정 금지).
//  비로그인 GET 은 가격표만(redirect 없음), POST 401. 응답 no-store
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { env } from '@/env'
import { apiError, dbRoute, parseBody, requireUser } from '@/lib/api'
import { getSessionUser, isAdmin } from '@/lib/auth'
import { feePlans, hostPlan, piKrw } from '@/lib/plan'
import { PAY_PLANS, piAmount, PLAN, planMemo, signQuote, SMN_PLAN } from '@/lib/plan-rules'
import { otherPlanPays, staleBusy } from '@/lib/seminar'

const noStore = { 'Cache-Control': 'no-store' }

export const GET = withAuthGuard(
  dbRoute(async (req) => {
    // 세션·가격표·시세 병렬(R-P1)
    const [user, plans, krw] = await Promise.all([getSessionUser(req), feePlans(), piKrw()])
    const me = user ? (isAdmin(user) ? { admin: true } : { admin: false, ...(await hostPlan(user.id)) }) : null
    return NextResponse.json(
      {
        freeSec: PLAN.freeSec,
        plans: plans.map((p) => ({
          plan: p.plan_cd,
          sec: p.use_sec_cnt,
          months: p.use_mon_cnt,
          krw: Number(p.krw_amt),
          pi: krw ? piAmount(Number(p.krw_amt), krw) : null,
        })),
        me,
      },
      { headers: noStore },
    )
  }),
)

const bodySchema = z.object({ plan: z.enum(PAY_PLANS) })

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    const [user, body] = await Promise.all([requireUser(req), parseBody(req, bodySchema)])
    if (user instanceof NextResponse) return user
    if (body instanceof NextResponse) return body
    // 가격표·시세·진행 중 결제 병렬(R-P1)
    const [plans, krw, others] = await Promise.all([feePlans(), piKrw(), otherPlanPays(user.id)])
    const f = plans.find((p) => p.plan_cd === body.plan)
    if (!f) return apiError('NOT_FOUND', 404)
    const amount = krw ? piAmount(Number(f.krw_amt), krw) : null
    if (!amount) return apiError('PRICE_UNAVAILABLE', 503)
    // 진행 중인 내 다른 요금제 결제 — 서명 전 이탈분은 Pi 조회 후 정리, 진행 중이면 막는다(검증기와 같은 규칙, R-P5)
    if (await staleBusy(others, user.id)) return apiError('PAY_ALREADY_PAID', 409)
    const q = signQuote({ u: user.id, p: body.plan, a: amount, e: Date.now() + PLAN.quoteTtlMs }, env.PI_SESSION_SECRET)
    return NextResponse.json(
      {
        amount: Number(amount),
        memo: planMemo(body.plan),
        metadata: { type: SMN_PLAN, plan: body.plan, q },
        krw: Number(f.krw_amt),
      },
      { headers: noStore },
    )
  }),
)
