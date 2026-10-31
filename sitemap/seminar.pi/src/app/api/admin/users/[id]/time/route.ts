// 사용자 시간 관리(관리자 메뉴 > 사용자관리, sql/024) — ADMIN 전용.
//  GET  = 최근 조정 이력 10건(요금제·반영 초·전후 남은 초·서비스권·사유·조정한 관리자·일시)
//  POST = 서비스권 지급 {op: svc, svc: H1|D1|M1, reason?} → fn_svc_smn_plan(무료 시간 — 지금부터 1시간·1일·1개월)
//         축소 {op: sub, plan: FREE|M|Y, min: 1~60000(분), reason?} → fn_adj_smn_plan(남은 만큼만, 없으면 409 ADJ_NOTHING)
//   둘 다 한 트랜잭션(이용권 잠금·이력 1행). 사유 200자. 대상 사용자 없음 404. 비로그인 401·비관리자 403(redirect 없음)
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, parseBody, requireAdmin } from '@/lib/api'
import { ADJ_MAX_MIN, ADJ_PLANS, isUuid, SVC_CDS } from '@/lib/seminar-rules'

const noStore = { 'Cache-Control': 'no-store' }
const reason = z.string().trim().max(200).optional()
const Body = z.discriminatedUnion('op', [
  z.object({ op: z.literal('svc'), svc: z.enum(SVC_CDS), reason }),
  z.object({ op: z.literal('sub'), plan: z.enum(ADJ_PLANS), min: z.number().int().min(1).max(ADJ_MAX_MIN), reason }),
])

type Ctx = { params: Promise<{ id: string }> }
type HistRow = {
  adj_id: string
  plan_cd: string
  adj_sec_cnt: number
  bfr_sec_cnt: number | string
  aft_sec_cnt: number | string
  svc_cd: string | null
  adj_rsn_cont: string | null
  regr_id: string
  reg_dtm: string
}

// 권한·대상 ID 확인(병렬) — 대상 존재는 각 처리에서
async function gate(req: NextRequest, ctx: unknown) {
  const [user, { id }] = await Promise.all([requireAdmin(req), (ctx as Ctx).params])
  if (user instanceof NextResponse) return user
  if (!isUuid(id)) return apiError('INVALID_INPUT', 400)
  return { user, id: id.toLowerCase() }
}

export const GET = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const g = await gate(req, ctx)
    if (g instanceof NextResponse) return g
    const { data, error } = await db()
      .from('smn_pln_adj_hist')
      .select('adj_id, plan_cd, adj_sec_cnt, bfr_sec_cnt, aft_sec_cnt, svc_cd, adj_rsn_cont, regr_id, reg_dtm')
      .eq('usr_id', g.id)
      .eq('del_yn', 'N')
      .order('reg_dtm', { ascending: false })
      .limit(10)
      .returns<HistRow[]>()
    if (error) return dbFail(error)
    // 조정한 관리자 이름(regr_id = 관리자 usr_id 글자)
    const admins = [...new Set(data.map((h) => h.regr_id).filter(isUuid))]
    const names = new Map<string, string>()
    if (admins.length) {
      const { data: us, error: ue } = await db().from('sys_user').select('usr_id, dsp_nm, pi_usr_nm').in('usr_id', admins)
      if (ue) return dbFail(ue)
      for (const u of us) names.set(u.usr_id, u.dsp_nm || u.pi_usr_nm || '')
    }
    return NextResponse.json(
      {
        rows: data.map((h) => ({
          id: h.adj_id,
          plan: h.plan_cd,
          sec: h.adj_sec_cnt,
          before: Number(h.bfr_sec_cnt),
          after: Number(h.aft_sec_cnt),
          svc: h.svc_cd,
          reason: h.adj_rsn_cont,
          by: names.get(h.regr_id) ?? '',
          at: h.reg_dtm,
        })),
      },
      { headers: noStore },
    )
  }),
)

export const POST = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const [g, body] = await Promise.all([gate(req, ctx), parseBody(req, Body)])
    if (g instanceof NextResponse) return g
    if (body instanceof NextResponse) return body
    const { data: target, error: te } = await db().from('sys_user').select('usr_id').eq('usr_id', g.id).eq('del_yn', 'N').maybeSingle()
    if (te) return dbFail(te)
    if (!target) return apiError('NOT_FOUND', 404)
    const { data, error } =
      body.op === 'svc'
        ? await db()
            .rpc('fn_svc_smn_plan', { p_usr_id: g.id, p_svc_cd: body.svc, p_rsn: body.reason ?? null, p_adm_id: g.user.id })
            .single<{ adj_sec: number; rem_sec: number | string; end_dtm: string | null }>()
        : await db()
            .rpc('fn_adj_smn_plan', { p_usr_id: g.id, p_plan_cd: body.plan, p_sec: -body.min * 60, p_rsn: body.reason ?? null, p_adm_id: g.user.id })
            .single<{ adj_sec: number; rem_sec: number | string; end_dtm?: undefined }>()
    if (error) return dbFail(error)
    if (!data.adj_sec) return apiError('ADJ_NOTHING', 409)
    return NextResponse.json(
      { ok: true, plan: body.op === 'svc' ? 'FREE' : body.plan, sec: data.adj_sec, remain: Number(data.rem_sec), endAt: data.end_dtm ?? null },
      { headers: noStore },
    )
  }),
)
