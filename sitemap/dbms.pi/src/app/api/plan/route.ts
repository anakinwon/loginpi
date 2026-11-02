// 연결 요금제 — GET /api/plan?link=&bndl=1 : 현재 요금제·남은 기간·한도·이번 기간 사용 횟수 + 가격표(원화 기준가·Pi 참고값) + 업그레이드 선택지
//  bndl=1(요금제 화면만) = schema.pi 'area_plan' 조회로 묶음 할인 여부(2초, 실패 = null — 할인 없이 표시). 하단 메뉴 배지는 bndl 없이 부른다
//  로그인·연결 소유 필수(401·404 — 화면이 게이트), 응답 no-store. 원화는 표시용, 결제 금액은 prepare 의 서명 견적만
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { dbRoute } from '@/lib/api'
import { linkAreaPlan, requireLink } from '@/lib/link/client'
import { aiUsedMonth, clctUsedToday, feeRows, piRates, planTerms } from '@/lib/plan'
import { upgradeOptions } from '@/lib/plan-pay'
import { bundleOk, krwDue, piAmount } from '@/lib/plan-rules'

export const GET = withGuard(
  dbRoute(async (req) => {
    const sp = req.nextUrl.searchParams
    const linkId = sp.get('link') ?? ''
    const ctx = await requireLink(req, linkId, 'ANY')
    if (ctx instanceof Response) return ctx as NextResponse
    // R-P1 — 전부 서로 독립. 묶음 할인 조회는 요금제 화면만(없어도 되는 값)
    const [rows, rates, terms, ai, clct, area] = await Promise.all([
      feeRows(),
      piRates(),
      planTerms(linkId),
      aiUsedMonth(linkId),
      clctUsedToday(linkId),
      sp.get('bndl') === '1' ? linkAreaPlan(linkId) : Promise.resolve(undefined),
    ])
    const bndl = area === undefined ? null : bundleOk(area)
    const pi = (krw: number) => (rates ? piAmount(krwDue(krw, !!bndl) ?? 0, rates.krw) : null)
    const p = ctx.plan
    return NextResponse.json(
      {
        cur: { plan: p.plan, end: p.end, grace: p.grace, aiMon: p.aiMon, keepDays: p.keepDays, clctDay: p.clctDay },
        used: { ai, clct },
        bndl,
        usdPerPi: rates?.usd ?? null,
        fees: rows
          .filter((r) => r.use_yn === 'Y')
          .map((r) => ({
            plan: r.plan_cd,
            prd: r.prd_cd,
            months: r.use_mon_cnt,
            krw: r.krw_amt,
            due: krwDue(r.krw_amt, !!bndl), // 묶음 할인 반영 원화(0 = 무료)
            pi: r.krw_amt > 0 ? pi(r.krw_amt) : '0',
            aiMon: r.ai_mon_cnt,
            keepDays: r.keep_day_cnt,
            clctDay: r.clct_day_cnt,
          })),
        upgrades: upgradeOptions(p, terms, rows, Date.now()).map((u) => ({ ...u, due: krwDue(u.krw, !!bndl), pi: pi(u.krw) })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }),
)
