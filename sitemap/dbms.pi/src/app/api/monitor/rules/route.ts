// /api/monitor/rules — 임계치 규칙(dbm_mon_rule, sql/030) : GET ?link=&page= 목록(페이지 50), POST 추가(연결당 50 상한), PATCH 사용 전환·논리삭제
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { z } from 'zod'
import { db, dbFail, dbRoute, parseBody } from '@/lib/api'
import { METRICS, OPS, RULE_MAX, type Rule } from '@/lib/monitor/rules'
import { linkGate } from '@/lib/monitor/server'

const COLS = 'rule_id, metric_cd, conn_id, op_cd, thr_val, use_yn'
const PAGE = 50
type Row = { rule_id: string; metric_cd: Rule['metricCd']; conn_id: string | null; op_cd: Rule['opCd']; thr_val: number | string; use_yn: 'Y' | 'N' }
const toRule = (r: Row): Rule => ({ ruleId: r.rule_id, metricCd: r.metric_cd, connId: r.conn_id, opCd: r.op_cd, thrVal: Number(r.thr_val), useYn: r.use_yn })
const bad = () => NextResponse.json({ error: 'INVALID_INPUT', code: 'INVALID_INPUT' }, { status: 400 })

export const GET = withGuard(
  dbRoute(async (req) => {
    const sp = req.nextUrl.searchParams
    const page = Math.max(1, Math.floor(Number(sp.get('page') ?? 1)) || 1)
    const g = await linkGate(req, sp.get('link'))
    if (g instanceof NextResponse) return g
    const from = (page - 1) * PAGE
    const r = await db()
      .from('dbm_mon_rule')
      .select(COLS, { count: 'exact' })
      .eq('lnk_id', g.linkId)
      .eq('del_yn', 'N')
      .order('reg_dtm', { ascending: true })
      .range(from, from + PAGE - 1)
    if (r.error) return dbFail(r.error)
    return NextResponse.json({ rules: (r.data as Row[]).map(toRule), total: r.count ?? 0, page, pageSize: PAGE })
  }),
)

const PostSchema = z.object({
  link: z.string(),
  metricCd: z.enum(METRICS),
  connId: z.string().trim().min(1).max(100).nullable().optional(),
  opCd: z.enum(OPS),
  thrVal: z.number().finite().min(-1e15).max(1e15),
})

export const POST = withGuard(
  dbRoute(async (req) => {
    const b = await parseBody(req, PostSchema)
    if (b instanceof NextResponse) return b
    const g = await linkGate(req, b.link)
    if (g instanceof NextResponse) return g
    const cnt = await db().from('dbm_mon_rule').select('rule_id', { count: 'exact', head: true }).eq('lnk_id', g.linkId).eq('del_yn', 'N')
    if (cnt.error) return dbFail(cnt.error)
    if ((cnt.count ?? 0) >= RULE_MAX) return NextResponse.json({ error: 'RULE_LIMIT', code: 'RULE_LIMIT' }, { status: 409 })
    // ponytail: 상한 확인과 추가가 원자적이지 않음 — 동시 추가 시 50을 약간 넘을 수 있음(설정 행이라 무해), 엄격히 하려면 RPC
    const who = g.usrId || 'ADMIN'
    const ins = await db()
      .from('dbm_mon_rule')
      .insert({ lnk_id: g.linkId, metric_cd: b.metricCd, conn_id: b.metricCd.startsWith('DB_') ? (b.connId ?? null) : null, op_cd: b.opCd, thr_val: b.thrVal, regr_id: who, modr_id: who })
      .select(COLS)
      .single()
    if (ins.error) return dbFail(ins.error)
    return NextResponse.json({ rule: toRule(ins.data as Row) })
  }),
)

const PatchSchema = z.object({
  link: z.string(),
  ruleId: z.string().uuid(),
  useYn: z.enum(['Y', 'N']).optional(),
  del: z.literal(true).optional(),
})

export const PATCH = withGuard(
  dbRoute(async (req) => {
    const b = await parseBody(req, PatchSchema)
    if (b instanceof NextResponse) return b
    if (!b.useYn && !b.del) return bad()
    const g = await linkGate(req, b.link)
    if (g instanceof NextResponse) return g
    const now = new Date().toISOString()
    const who = { modr_id: g.usrId || 'ADMIN', mod_dtm: now }
    const patch = b.del ? { del_yn: 'Y', del_dtm: now, ...who } : { use_yn: b.useYn, ...who }
    const r = await db()
      .from('dbm_mon_rule')
      .update(patch)
      .eq('rule_id', b.ruleId)
      .eq('lnk_id', g.linkId)
      .eq('del_yn', 'N')
      .select('rule_id')
    if (r.error) return dbFail(r.error)
    if (!r.data.length) return NextResponse.json({ error: 'NOT_FOUND', code: 'NOT_FOUND' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }),
)
