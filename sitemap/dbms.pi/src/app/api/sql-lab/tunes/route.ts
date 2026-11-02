// AI 튜닝 권고(PRD 12 §2-4) — GET /api/sql-lab/tunes?link=&page= (목록, 20건 단위) / POST { linkId, planId, locale? } (저장 계획 1건 → 권고 생성)
//  엔진 : AI(ANTHROPIC_API_KEY) 우선, 없거나 실패하면 규칙 권고(RULE). 입력은 이미 마스킹 저장된 계획(A3). 계획 1건당 활성 권고 1건(x_dbm_sql_tun_02)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withGuard } from '@pi/guard'
import { getLanguage, getLocaleInfo } from '@pi/i18n'
import { apiError, db, dbFail, dbRoute, parseBody } from '@/lib/api'
import { parsePlan } from '@/lib/sql-lab/plan'
import { planRequired } from '@/lib/link/client'
import { aiUsedMonth } from '@/lib/plan'
import { nextPlan } from '@/lib/plan-rules'
import { requireUserLink, resolveLink } from '@/lib/sql-lab/server'
import { ruleRecommend, TUN_COLS } from '@/lib/sql-lab/tune'
import { aiRecommend } from '@/lib/sql-lab/tune-ai'

const PAGE_SIZE = 20
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const Body = z.object({
  linkId: z.string().regex(UUID),
  planId: z.string().regex(UUID),
  // AI 권고 title·reason 작성 언어(규칙 권고는 화면 번역키라 무관)
  locale: z.string().max(20).optional().catch(undefined),
})

// routing locale(국가 코드 포함, 예 ad → ca) → AI 에 넘길 언어 이름(모르면 English)
const aiLang = (locale?: string) =>
  getLocaleInfo(getLanguage(locale ?? '') ?? '')?.englishName ?? 'English'

export const GET = withGuard(
  dbRoute(async (req) => {
    const sp = req.nextUrl.searchParams
    const linkId = sp.get('link')
    if (!linkId) return apiError('INVALID_INPUT', 400)
    const page = Math.max(1, Number(sp.get('page')) || 1)
    const link = await resolveLink(req, linkId, 'ANY')
    if (link instanceof NextResponse) return link
    // 다음 쪽 유무는 1건 더 읽어 판단(정확 건수 미사용 — R-P3)
    const { data, error } = await db()
      .from('dbm_sql_tun')
      .select(TUN_COLS)
      .eq('lnk_id', linkId)
      .eq('del_yn', 'N')
      .order('reg_dtm', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    if (error) return dbFail(error)
    return NextResponse.json({
      items: data.slice(0, PAGE_SIZE),
      page,
      hasNext: data.length > PAGE_SIZE,
    })
  }),
)

export const POST = withGuard(
  dbRoute(async (req) => {
    const body = await parseBody(req, Body)
    if (body instanceof NextResponse) return body
    // R-P1 — 소유 확인·계획·기존 권고 조회는 서로 독립
    const [ok, planR, dupR, aiUsed] = await Promise.all([
      requireUserLink(req, body.linkId, 'SQL_TUNE'),
      db()
        .from('dbm_sql_plan')
        .select('plan_id, conn_id, sql_hash, sql_txt, plan_json, total_cost')
        .eq('plan_id', body.planId)
        .eq('lnk_id', body.linkId)
        .eq('del_yn', 'N')
        .maybeSingle(),
      db()
        .from('dbm_sql_tun')
        .select('tun_id')
        .eq('plan_id', body.planId)
        .eq('del_yn', 'N')
        .maybeSingle(),
      aiUsedMonth(body.linkId),
    ])
    if (ok instanceof NextResponse) return ok
    // AI 튜닝 월 횟수(sql/035 ai_mon_cnt — D2 30·D3 100). 초과 = 다음 요금제 안내(최상위면 need null). ponytail: 동시 요청은 1회 넘칠 수 있음
    if (aiUsed >= ok.link.plan.aiMon) return planRequired(nextPlan(ok.link.plan.plan), 'PLAN_LIMIT')
    if (planR.error) return dbFail(planR.error)
    if (dupR.error) return dbFail(dupR.error)
    if (!planR.data) return apiError('NOT_FOUND', 404)
    if (dupR.data)
      return NextResponse.json(
        { error: 'TUN_EXISTS', code: 'TUN_EXISTS', tunId: dupR.data.tun_id },
        { status: 409 },
      )
    const p = planR.data as {
      conn_id: string
      sql_hash: string
      sql_txt: string
      plan_json: unknown
      total_cost: number
    }
    const plan = parsePlan(p.plan_json)
    if (!plan) return apiError('INVALID_INPUT', 400)
    const rules = ruleRecommend(p.sql_txt, plan)
    const ai = await aiRecommend(p.sql_txt, plan, rules, aiLang(body.locale))
    const { data, error } = await db()
      .from('dbm_sql_tun')
      .insert({
        lnk_id: body.linkId,
        conn_id: p.conn_id,
        plan_id: body.planId,
        sql_hash: p.sql_hash,
        engn_cd: ai ? 'AI' : 'RULE',
        rcmd_json: ai ?? rules,
        bfr_cost: p.total_cost,
        regr_id: ok.user.id,
        modr_id: ok.user.id,
      })
      .select(TUN_COLS)
      .single()
    // 동시 클릭 경합 — 유일 인덱스 위반은 이미 있음으로(R-P5)
    if (error?.code === '23505')
      return NextResponse.json(
        { error: 'TUN_EXISTS', code: 'TUN_EXISTS' },
        { status: 409 },
      )
    if (error) return dbFail(error)
    return NextResponse.json({ item: data })
  }),
)
