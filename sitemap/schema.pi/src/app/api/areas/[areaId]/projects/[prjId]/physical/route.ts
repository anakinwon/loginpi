// 물리 모델(PRD_PiErd S2 P1~P4) — GET : 물리 모델 목록 + 변환 미리보기(?dbms=, 관문·이슈·테이블 수) / ?mdl= : 저장된 물리 모델 + 현재 논리와의 차이
// POST : 전환(관문 통과·이슈 0 일 때만, 프로젝트 × DBMS 활성 1건) / DELETE ?mdl=&ver_no= : 논리 삭제(재전환은 삭제 후 다시 전환)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, audit, dbError, errMsg, parseBody, requireAreaRole } from '@/lib/api'
import { db } from '@/lib/db'
import { delPhy, listPhy, loadPhy, phyPlan, savePhy } from '@/lib/model-phy'
import { DBMS_PRFL, isDbms, type DbmsCd } from '@/lib/modelpi/dbms'
import { phyDiff } from '@/lib/modelpi/phy'

type Ctx = { params: Promise<{ areaId: string; prjId: string }> }
const uuid = z.string().uuid()
const body = z.object({
  dbms_cd: z.string().refine(isDbms),
  idntfr_ltr_cd: z.enum(['UPPER', 'LOWER']).optional(),
  del_col_use_yn: z.enum(['Y', 'N']).default('Y'),
  phy_mdl_desc: z.string().max(2000).nullish(),
})

export async function GET(req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  if (!uuid.safeParse(prjId).success) return apiError('INVALID_INPUT', 400)
  const sp = new URL(req.url).searchParams
  try {
    const mdlId = sp.get('mdl')
    if (mdlId) {
      if (!uuid.safeParse(mdlId).success) return apiError('INVALID_INPUT', 400)
      const p = await loadPhy(areaId, mdlId)
      if (!p || p.mdl.prj_id !== prjId) return apiError('NOT_FOUND', 404)
      const plan = await phyPlan(areaId, prjId, p.mdl.dbms_cd as DbmsCd, p.mdl.del_col_use_yn === 'Y')
      return NextResponse.json({ ok: true, ...p, diff: plan ? phyDiff(p.tables, plan.tables) : null })
    }
    const want = sp.get('dbms')
    if (want !== null && !isDbms(want)) return apiError('INVALID_INPUT', 400)
    const prj = await db().from('mdl_prj').select('trgt_dbms_cd').eq('prj_id', prjId).eq('area_id', areaId).eq('del_yn', 'N').maybeSingle()
    if (prj.error) throw prj.error
    if (!prj.data) return apiError('NOT_FOUND', 404)
    const t = want ?? (prj.data as { trgt_dbms_cd: string }).trgt_dbms_cd
    const dbms: DbmsCd = isDbms(t) ? t : '0014'
    const plan = await phyPlan(areaId, prjId, dbms, true)
    if (!plan) return apiError('NOT_FOUND', 404)
    return NextResponse.json({
      ok: true,
      models: await listPhy(areaId, prjId),
      preview: { dbms_cd: dbms, idntfr_ltr_cd: DBMS_PRFL[dbms].identCase.toUpperCase(), why: plan.why, issues: plan.issues, tbl_cnt: plan.tables.length, col_cnt: plan.tables.reduce((n, t) => n + t.cols.length, 0), fk_cnt: plan.fks.length, tables: plan.tables.slice(0, 50) },
      capped: plan.capped,
    })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'REQUEST')
  if (auth instanceof NextResponse) return auth
  if (!uuid.safeParse(prjId).success) return apiError('INVALID_INPUT', 400)
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  const dbms = b.dbms_cd as DbmsCd
  try {
    const plan = await phyPlan(areaId, prjId, dbms, b.del_col_use_yn === 'Y')
    if (!plan) return apiError('NOT_FOUND', 404)
    if (plan.why.length) return NextResponse.json({ ok: false, code: 'PHY_GATE', message: errMsg('PHY_GATE'), why: plan.why }, { status: 409 })
    if (plan.issues.length) return NextResponse.json({ ok: false, code: 'PHY_ISSUES', message: errMsg('PHY_ISSUES'), issues: plan.issues }, { status: 409 })
    if (plan.capped) return apiError('INVALID_INPUT', 400) // 조회 상한을 넘은 모델은 일부만 전환되므로 거부
    const ltr = b.idntfr_ltr_cd ?? (DBMS_PRFL[dbms].identCase === 'lower' ? 'LOWER' : 'UPPER')
    const item = await savePhy(areaId, prjId, { dbms, ltr, delCol: b.del_col_use_yn === 'Y', desc: b.phy_mdl_desc ?? null }, plan.tables, plan.fks, auth.user.usr_id)
    await audit({ area_id: areaId, tgt_tp_cd: 'PHY', tgt_id: item.phy_mdl_id, act_cd: 'INS', aftr_val: { prj_id: prjId, dbms_cd: dbms, idntfr_ltr_cd: ltr, tbl: plan.tables.length, fk: plan.fks.length }, usr_id: auth.user.usr_id })
    return NextResponse.json({ ok: true, item, tbl_cnt: plan.tables.length, fk_cnt: plan.fks.length }, { status: 201 })
  } catch (e) {
    const x = e as { code?: string; message?: string }
    return dbError(x, /prj_dbms/.test(x.message ?? '') ? 'PHY_DUP' : 'INVALID_INPUT') // 프로젝트 × DBMS 중복만 PHY_DUP
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'REQUEST')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const mdlId = sp.get('mdl')
  const ver = Number(sp.get('ver_no'))
  if (!uuid.safeParse(prjId).success || !uuid.safeParse(mdlId).success || !Number.isInteger(ver)) return apiError('INVALID_INPUT', 400)
  try {
    const p = await loadPhy(areaId, mdlId!)
    if (!p || p.mdl.prj_id !== prjId) return apiError('NOT_FOUND', 404)
    if (p.mdl.ver_no !== ver) return apiError('VERSION_CONFLICT', 409)
    await delPhy(mdlId!, auth.user.usr_id)
    await audit({ area_id: areaId, tgt_tp_cd: 'PHY', tgt_id: mdlId!, act_cd: 'DEL', bfr_val: { dbms_cd: p.mdl.dbms_cd, tbl: p.tables.length }, usr_id: auth.user.usr_id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
