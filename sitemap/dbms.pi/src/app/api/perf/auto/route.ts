// 성능 상시 자동 수집 설정(sql/021) — GET ?link=&conn= : 켜짐·마지막 실행·결과·켤 수 있는지 / PUT { linkId, connId, on } : 켜기(D1 관측부터)·끄기(누구나)
//  실행은 크론 /api/cron/perf-collect(매일 KST 03:00~04:50). 소유자(또는 ADMIN)만 — linkParams(requireLink 'PERF')
//  켜기 = 행이 있으면 되살림(use_yn Y·del_yn N·결과 초기화, 논리삭제 행 포함 — PK 충돌 방지), 없으면 생성(등록자 = 세션 사용자). 동시 생성 충돌(23505)은 갱신으로 재시도(R-P5)
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { withGuard } from '@pi/guard'
import { db, dbFail, dbRoute, parseBody } from '@/lib/api'
import { planRequired } from '@/lib/link/client'
import { allows, PERM_MIN } from '@/lib/plan-rules'
import { linkParams } from '@/lib/perf/server'

const T = 'dbm_prf_clct_cfg'
const bodySchema = z.object({ linkId: z.string(), connId: z.string(), on: z.boolean() })

export const GET = withGuard(
  dbRoute(async (req: NextRequest) => {
    const sp = req.nextUrl.searchParams
    const p = await linkParams(req, sp.get('link'), sp.get('conn'))
    if (p instanceof NextResponse) return p
    const { data, error } = await db()
      .from(T)
      .select('use_yn, lst_run_dtm, lst_rslt_cd')
      .eq('lnk_id', p.linkId)
      .eq('conn_id', p.connId)
      .eq('del_yn', 'N')
      .maybeSingle()
    if (error) return dbFail(error)
    return NextResponse.json({
      on: data?.use_yn === 'Y',
      lstRunDtm: (data?.lst_run_dtm as string | null) ?? null,
      lstRsltCd: (data?.lst_rslt_cd as string | null) ?? null,
      canOn: allows(p.ctx.plan.plan, 'PERF_AUTO'),
      need: PERM_MIN.PERF_AUTO,
    })
  }),
)

export const PUT = withGuard(
  dbRoute(async (req: NextRequest) => {
    const body = await parseBody(req, bodySchema)
    if (body instanceof NextResponse) return body
    const p = await linkParams(req, body.linkId, body.connId)
    if (p instanceof NextResponse) return p
    if (body.on && !allows(p.ctx.plan.plan, 'PERF_AUTO')) return planRequired(PERM_MIN.PERF_AUTO)

    const usr = p.ctx.usrId
    const patch = body.on
      ? { use_yn: 'Y', del_yn: 'N', del_dtm: null, lst_rslt_cd: null, modr_id: usr }
      : { use_yn: 'N', modr_id: usr }
    const upd = () =>
      db().from(T).update(patch).eq('lnk_id', p.linkId).eq('conn_id', p.connId).select('lnk_id')
    let r = await upd()
    if (r.error) return dbFail(r.error)
    // 끄기는 행이 없으면 할 일 없음. 켜기만 새로 만든다
    if (body.on && !r.data?.length) {
      const ins = await db().from(T).insert({ lnk_id: p.linkId, conn_id: p.connId, ...patch, regr_id: usr })
      if (ins.error?.code === '23505') r = await upd()
      else if (ins.error) return dbFail(ins.error)
      if (r.error) return dbFail(r.error)
    }
    return NextResponse.json({ on: body.on })
  }),
)
