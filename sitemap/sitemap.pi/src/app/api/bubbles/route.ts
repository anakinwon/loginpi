// 메인 버블 API — GET ?period=day|week|month&ctgr= : APPROVED 사이트 + 요금제(plan_cd) + 기간 조회 합·직전 동일 기간 대비 증감률.
// 증감은 fn_sel_stat_site_chg RPC(DB 합산). DB 미설정·조회 실패 시 sitemap/sites.json 정적 폴백(demo=true, 값 0%) — 메인 화면이 비지 않게
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { resolveDbConfig } from '@pi/db'
import registry from '../../../../../sites.json'
import { apiError, db, PUBLIC_CACHE } from '@/lib/api'
import {
  BUBBLE_DAYS,
  PLAN_CD,
  SITE_CTGR,
  type BubbleItem,
  type BubblePeriod,
  type BubbleResponse,
  type PlanCd,
  type SiteCtgr,
} from '@/lib/site'

export const dynamic = 'force-dynamic'

// ponytail: 버블은 화면당 수십 개가 한계 — 상한 200, 넘으면 요금제 상위만 노출하는 정책 필요
const MAX_BUBBLES = 200

const pct = (cur: number, prev: number) =>
  prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0

function demo(period: BubblePeriod, ctgr: string | null): BubbleResponse {
  const items: BubbleItem[] = registry.sites
    .filter((s) => s.listSts === 'APPROVED' && (!ctgr || s.ctgr === ctgr))
    .map((s) => ({
      id: s.domain,
      domain: s.domain,
      name: s.domain === 'cafe.pi' ? 'PyCafé™' : s.domain.replace(/\.pi$/, ''),
      ctgr: s.ctgr as SiteCtgr,
      img: null,
      plan: (PLAN_CD.includes(s.planCd as PlanCd) ? s.planCd : 'NONE') as PlanCd,
      own: true, // 레지스트리 19개는 전부 자사
      views: 0,
      chgPct: 0,
    }))
  return { items, period, demo: true }
}

async function load(
  period: BubblePeriod,
  ctgr: string | null,
): Promise<BubbleResponse | null> {
  let q = db()
    .from('site_mst')
    .select('site_id, site_dom_nm, site_nm, site_ctgr_cd, site_img_url, plan_cd, own_site_yn')
    .eq('del_yn', 'N')
    .eq('site_sts_cd', 'APPROVED')
  if (ctgr) q = q.eq('site_ctgr_cd', ctgr)
  const [sites, stats] = await Promise.all([
    q.order('apv_dtm', { ascending: false }).limit(MAX_BUBBLES),
    db().rpc('fn_sel_stat_site_chg', { p_days: BUBBLE_DAYS[period] }),
  ])
  if (sites.error || stats.error) {
    console.error('[bubbles]', sites.error ?? stats.error)
    return null
  }
  const chg = new Map<string, { cur: number; prev: number }>()
  for (const r of (stats.data ?? []) as {
    site_id: string
    cur_view_cnt: number
    prev_view_cnt: number
  }[])
    chg.set(r.site_id, {
      cur: Number(r.cur_view_cnt),
      prev: Number(r.prev_view_cnt),
    })
  const items = (sites.data ?? []).map((s): BubbleItem => {
    const c = chg.get(s.site_id) ?? { cur: 0, prev: 0 }
    return {
      id: s.site_id,
      domain: s.site_dom_nm,
      name: s.site_nm,
      ctgr: s.site_ctgr_cd,
      img: s.site_img_url,
      plan: s.plan_cd,
      own: s.own_site_yn === 'Y',
      views: c.cur,
      chgPct: pct(c.cur, c.prev),
    }
  })
  return { items, period, demo: false }
}

export const GET = withGuard(async (req) => {
  const sp = req.nextUrl.searchParams
  const period = (sp.get('period') ?? 'day') as BubblePeriod
  const ctgr = sp.get('ctgr') || null
  if (!Object.hasOwn(BUBBLE_DAYS, period)) return apiError('INVALID_INPUT', 400)
  if (ctgr && !SITE_CTGR.includes(ctgr as SiteCtgr))
    return apiError('INVALID_INPUT', 400)

  const { url, key } = resolveDbConfig()
  let data: BubbleResponse | null = null
  if (url && key) {
    try {
      data = await load(period, ctgr)
    } catch (e) {
      console.error('[bubbles]', e)
    }
  }
  // 폴백은 캐시하지 않는다 — DB 복구 즉시 실데이터로 전환
  return data
    ? NextResponse.json(data, { headers: PUBLIC_CACHE })
    : NextResponse.json(demo(period, ctgr), {
        headers: { 'Cache-Control': 'no-store' },
      })
})
