// 물리 모델(PRD_PiErd S2 P1~P4) — GET : 물리 모델 목록 + 변환 미리보기(?dbms=, 관문·이슈·테이블 수) / ?mdl= : 저장된 물리 모델 + 현재 논리와의 차이
// GET ?mdl=&format=ddl : DDL(.sql 내려받기, S2 P6) / ?mdl=&format=csv&type=tbl|col : 테이블·칼럼 정의서 CSV
// PATCH : 칼럼 그리드 편집(테이블 1개, 순서·NULL·기본값 묶음, 칼럼별 ver_no 잠금, S2 P5)
// GET ?mdl=&format=alter : 변경분 DDL(현재 논리와의 차이, S5) / POST ?sync=1 {phy_mdl_id, ver_no} : 논리 변경을 저장 모델에 동기화(사용자 편집 유지)
// POST {dbms_cd, ent_ids} : 엔터티 선택 전환(마스터 지시 2026-10-17 — 작성완료 엔터티만, 범위 관문·이슈 0, 모델 없으면 생성·있으면 추가)
//  관계 1개 이상 필수(마스터 지시 2026-10-20) — 관계 없는 엔터티는 전환 불가, DA·SYS 만 no_rel_exc 로 예외 적용(감사 이력에 남김)
// GET ?dbms=&ent=a,b : 선택 엔터티 범위 미리보기(없으면 작성완료·미전환 엔터티 전체) / DELETE ?mdl=&ver_no= : 논리 삭제(재전환은 삭제 후 다시 전환)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, audit, dbError, errMsg, parseBody, requireAreaRole, UQ, uqHit } from '@/lib/api'
import { db } from '@/lib/db'
import { inChunks } from '@/lib/paging'
import { kstDtm } from '@/lib/bulk'
import { convertEntities, delPhy, listPhy, loadPhy, phyDdlInput, phyPlan, phyPlanOf, syncPhy, syncPlan, tpMapOf } from '@/lib/model-phy'
import { loadLogical } from '@/lib/model-logical'
import { alterDdl } from '@/lib/modelpi/phy-sync'
import { autoIncCol, genDdl, phyDocTables } from '@/lib/modelpi/ddl'
import { docCsv } from '@/lib/modelpi/docs'
import { DBMS_PRFL, isDbms, type DbmsCd } from '@/lib/modelpi/dbms'
import { checkColEdits, phyDiff } from '@/lib/modelpi/phy'

type Ctx = { params: Promise<{ areaId: string; prjId: string }> }
const uuid = z.string().uuid()
const body = z.object({
  dbms_cd: z.string().refine(isDbms),
  idntfr_ltr_cd: z.enum(['UPPER', 'LOWER']).optional(),
  phy_mdl_desc: z.string().max(2000).nullish(),
  ent_ids: z.array(uuid).min(1).max(500),
  no_rel_exc: z.boolean().optional(), // 관계 없는 엔터티 예외 전환(DA 특권)
})

// 관계(부모·자식 어느 쪽이든)가 하나도 없는 엔터티 id
async function noRelEnts(areaId: string, ids: string[]) {
  const q = (col: 'prnt_ent_id' | 'chld_ent_id') => inChunks<{ prnt_ent_id: string; chld_ent_id: string }>(ids, (part) => db().from('mdl_rel').select('prnt_ent_id, chld_ent_id').eq('area_id', areaId).eq('del_yn', 'N').in(col, part))
  const rs = await Promise.all([q('prnt_ent_id'), q('chld_ent_id')])
  for (const r of rs) if (r.error) throw r.error
  const has = new Set(rs.flatMap((r) => r.data ?? []).flatMap((r) => [r.prnt_ent_id, r.chld_ent_id]))
  return ids.filter((id) => !has.has(id))
}

// 프로젝트 엔터티(논리 상태 포함)
async function prjEnts(areaId: string, prjId: string) {
  const r = await db().from('mdl_ent').select('ent_id, ent_log_nm, lgc_sts_cd').eq('area_id', areaId).eq('prj_id', prjId).eq('del_yn', 'N').limit(5000)
  if (r.error) throw r.error
  return r.data as { ent_id: string; ent_log_nm: string; lgc_sts_cd: string }[]
}

export async function GET(req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'MODEL_VIEW')
  if (auth instanceof NextResponse) return auth
  if (!uuid.safeParse(prjId).success) return apiError('INVALID_INPUT', 400)
  const sp = new URL(req.url).searchParams
  try {
    const mdlId = sp.get('mdl')
    if (mdlId) {
      if (!uuid.safeParse(mdlId).success) return apiError('INVALID_INPUT', 400)
      const p = await loadPhy(areaId, mdlId)
      if (!p || p.mdl.prj_id !== prjId) return apiError('NOT_FOUND', 404)
      const format = sp.get('format')
      if (format === 'alter') {
        const s = await syncPlan(areaId, prjId, p)
        if (!s) return apiError('NOT_FOUND', 404)
        const prjNm = ((await db().from('mdl_prj').select('prj_nm').eq('prj_id', prjId).maybeSingle()).data as { prj_nm: string } | null)?.prj_nm ?? 'model'
        const at = kstDtm(new Date().toISOString())
        const sql = alterDdl(s.ops, { dbms: p.mdl.dbms_cd as DbmsCd, ltr: p.mdl.idntfr_ltr_cd as 'UPPER' | 'LOWER', prjNm, at }) + (s.addFk.length || s.delFk.length ? `-- FK 변경 ${s.addFk.length}건 추가·${s.delFk.length}건 삭제 : 동기화 후 전체 DDL 의 FK 문을 참고하십시오\n` : '')
        const name = encodeURIComponent(`${prjNm}_${DBMS_PRFL[p.mdl.dbms_cd as DbmsCd].nm}_변경분DDL_${at.slice(0, 10)}.sql`)
        return new NextResponse(sql, { headers: { 'Content-Type': 'application/sql; charset=utf-8', 'Content-Disposition': `attachment; filename*=UTF-8''${name}`, 'Cache-Control': 'no-store' } })
      }
      if (format === 'ddl' || format === 'csv') {
        const type = sp.get('type')
        if (format === 'csv' && type !== 'tbl' && type !== 'col') return apiError('INVALID_INPUT', 400)
        const x = await phyDdlInput(areaId, prjId, p)
        if (!x) return apiError('NOT_FOUND', 404)
        const at = kstDtm(new Date().toISOString())
        const dbmsNm = DBMS_PRFL[x.d.dbms].nm
        const doc = format === 'csv' ? phyDocTables(x.d.tables)[type as 'tbl' | 'col'] : null
        const name = encodeURIComponent(`${x.prjNm}_${dbmsNm}_${doc ? doc.title : 'DDL'}_${at.slice(0, 10)}.${doc ? 'csv' : 'sql'}`)
        return new NextResponse(doc ? docCsv(doc) : genDdl(x.d, { prjNm: x.prjNm, at }), {
          headers: { 'Content-Type': doc ? 'text/csv; charset=utf-8' : 'application/sql; charset=utf-8', 'Content-Disposition': `attachment; filename*=UTF-8''${name}`, 'Cache-Control': 'no-store' },
        })
      }
      // 차이 = 전환된 엔터티 범위(전환 안 한 엔터티는 추가 테이블로 세지 않음)
      const plan = await phyPlan(areaId, prjId, p.mdl.dbms_cd as DbmsCd, new Set(p.tables.map((t) => t.ent_id)))
      return NextResponse.json({ ok: true, ...p, diff: plan ? phyDiff(p.tables, plan.tables) : null })
    }
    const want = sp.get('dbms')
    if (want !== null && !isDbms(want)) return apiError('INVALID_INPUT', 400)
    // 서로 독립인 조회는 동시에 — 물리 모델은 DBMS 결정 전이므로 프로젝트 전체를 받아 아래에서 고름(프로젝트 × DBMS 유니크)
    // 전환 테이블도 물리 모델 조인(프로젝트·DBMS)으로 같은 묶음에서 조회 — DBMS 미지정이면 프로젝트 전체를 받아 아래에서 거름
    let tbq = db().from('mdl_phy_tbl').select('ent_id, mdl_phy_mdl!inner(dbms_cd)').eq('del_yn', 'N').eq('mdl_phy_mdl.area_id', areaId).eq('mdl_phy_mdl.prj_id', prjId).eq('mdl_phy_mdl.del_yn', 'N')
    if (want !== null) tbq = tbq.eq('mdl_phy_mdl.dbms_cd', want)
    // 논리 로드·타입 매핑(dbms 지정 시)도 같은 묶음에서 시작 — scope 는 결과를 거르는 데만 쓰임
    const [prj, ents, tb, models, lg, tp0] = await Promise.all([
      db().from('mdl_prj').select('trgt_dbms_cd').eq('prj_id', prjId).eq('area_id', areaId).eq('del_yn', 'N').maybeSingle(),
      prjEnts(areaId, prjId),
      tbq.limit(want !== null ? 5000 : 20000),
      listPhy(areaId, prjId),
      loadLogical(areaId, prjId),
      want !== null ? tpMapOf(want as DbmsCd) : Promise.resolve(null),
    ])
    if (prj.error) throw prj.error
    if (!prj.data) return apiError('NOT_FOUND', 404)
    const t = want ?? (prj.data as { trgt_dbms_cd: string }).trgt_dbms_cd
    const dbms: DbmsCd = isDbms(t) ? t : '0014'
    const pick = (sp.get('ent') ?? '').split(',').filter((x) => uuid.safeParse(x).success).slice(0, 500)
    // 기본 범위 = 작성완료이면서 이 DBMS 물리 모델에 아직 전환되지 않은 엔터티
    if (tb.error) throw tb.error
    const conv = new Set<string>()
    for (const x of (tb.data ?? []) as unknown as { ent_id: string; mdl_phy_mdl: { dbms_cd: string } | { dbms_cd: string }[] }[]) {
      if ([x.mdl_phy_mdl].flat()[0]?.dbms_cd === dbms) conv.add(x.ent_id)
    }
    const scope = new Set(pick.length ? pick : ents.filter((e) => e.lgc_sts_cd === 'CMPTN' && !conv.has(e.ent_id)).map((e) => e.ent_id))
    // dbms 미지정이면 trgt_dbms_cd 확정 후 타입 매핑만 조회
    const tp = tp0 ?? (await tpMapOf(dbms))
    const plan = phyPlanOf(lg, tp, dbms, scope)
    if (!plan) return apiError('NOT_FOUND', 404)
    return NextResponse.json({
      ok: true,
      models,
      preview: { dbms_cd: dbms, idntfr_ltr_cd: DBMS_PRFL[dbms].identCase.toUpperCase(), why: plan.why, issues: plan.issues, tbl_cnt: plan.tables.length, col_cnt: plan.tables.reduce((n, t) => n + t.cols.length, 0), fk_cnt: plan.fks.length, tables: plan.tables.slice(0, 50) },
      capped: plan.capped,
    })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'MODEL_EDIT')
  if (auth instanceof NextResponse) return auth
  if (!uuid.safeParse(prjId).success) return apiError('INVALID_INPUT', 400)
  if (new URL(req.url).searchParams.get('sync') === '1') {
    const sb = await parseBody(req, z.object({ phy_mdl_id: uuid, ver_no: z.number().int() }))
    if (sb instanceof NextResponse) return sb
    try {
      const p = await loadPhy(areaId, sb.phy_mdl_id)
      if (!p || p.mdl.prj_id !== prjId) return apiError('NOT_FOUND', 404)
      const s = await syncPlan(areaId, prjId, p)
      if (!s) return apiError('NOT_FOUND', 404)
      if (s.why.length) return NextResponse.json({ ok: false, code: 'PHY_GATE', message: errMsg('PHY_GATE'), why: s.why }, { status: 409 })
      if (s.issues.length) return NextResponse.json({ ok: false, code: 'PHY_ISSUES', message: errMsg('PHY_ISSUES'), issues: s.issues }, { status: 409 })
      if (s.capped) return apiError('INVALID_INPUT', 400)
      const r = await syncPhy(areaId, sb.phy_mdl_id, sb.ver_no, s, auth.user.usr_id)
      if (r === 'VERSION_CONFLICT') return apiError('VERSION_CONFLICT', 409)
      await audit({ area_id: areaId, tgt_tp_cd: 'PHY', tgt_id: sb.phy_mdl_id, act_cd: 'UPD', aftr_val: { sync: r }, usr_id: auth.user.usr_id })
      return NextResponse.json({ ok: true, ...r })
    } catch (e) {
      return dbError(e as { code?: string; message?: string })
    }
  }
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  const dbms = b.dbms_cd as DbmsCd
  try {
    // 선택 엔터티 = 이 프로젝트 소속·작성완료
    const ents = await prjEnts(areaId, prjId)
    if (b.ent_ids.some((id) => !ents.some((e) => e.ent_id === id))) return apiError('NOT_FOUND', 404)
    const notLgc = ents.filter((e) => b.ent_ids.includes(e.ent_id) && e.lgc_sts_cd !== 'CMPTN')
    if (notLgc.length) return NextResponse.json({ ok: false, code: 'SUBJ_NOT_LGC', message: errMsg('SUBJ_NOT_LGC'), why: notLgc.map((e) => `${e.ent_log_nm} : 작성중`) }, { status: 409 })
    const noRel = await noRelEnts(areaId, b.ent_ids)
    const relExc = noRel.length > 0 && !!b.no_rel_exc && (auth.role === 'DA' || auth.role === 'SYS')
    if (noRel.length && !relExc) {
      const nm = new Map(ents.map((e) => [e.ent_id, e.ent_log_nm]))
      return NextResponse.json({ ok: false, code: 'PHY_NO_REL', message: errMsg('PHY_NO_REL'), why: noRel.map((id) => `${nm.get(id)} : 관계 없음`), exc: auth.role === 'DA' || auth.role === 'SYS' }, { status: 409 })
    }
    const scope = new Set(b.ent_ids)
    const plan = await phyPlan(areaId, prjId, dbms, scope)
    if (!plan) return apiError('NOT_FOUND', 404)
    if (plan.why.length) return NextResponse.json({ ok: false, code: 'PHY_GATE', message: errMsg('PHY_GATE'), why: plan.why }, { status: 409 })
    if (plan.issues.length) return NextResponse.json({ ok: false, code: 'PHY_ISSUES', message: errMsg('PHY_ISSUES'), issues: plan.issues }, { status: 409 })
    if (plan.capped) return apiError('INVALID_INPUT', 400) // 조회 상한을 넘은 모델은 일부만 전환되므로 거부
    const ltr = b.idntfr_ltr_cd ?? (DBMS_PRFL[dbms].identCase === 'lower' ? 'LOWER' : 'UPPER')
    const r = await convertEntities(areaId, prjId, { dbms, ltr, desc: b.phy_mdl_desc ?? null }, b.ent_ids, auth.user.usr_id, { plan, scope })
    if (!r) return apiError('NOT_FOUND', 404)
    if (!r.tbl) return apiError('NO_CHANGE', 400) // 선택 엔터티가 모두 이미 전환됨
    // 부모를 나중에 전환해 기존 자식 테이블에 FK 가 생겼으면 그 자식 테이블만 동기화(FK 칼럼 + 그 테이블에 쌓인 다른 논리 변경도 함께) — 물리 작성중·논리 작성완료 테이블만(syncPlan 범위)
    //  실패해도 전환은 이미 저장됐으므로 오류만 기록하고 성공 응답(화면 위쪽 동기화 안내로 재시도)
    let fkSync = 0
    try {
      // 자식 테이블 묶음을 loadPhy·syncPlan·syncPhy 각 1회로 처리(자식마다 직렬 재조회하지 않음)
      if (r.fkChild.length) {
        const p = await loadPhy(areaId, r.phy_mdl_id!)
        const ids = p ? p.tables.filter((x) => r.fkChild.includes(x.ent_id)).map((x) => x.phy_tbl_id) : []
        const s = p && ids.length ? await syncPlan(areaId, prjId, p, 'sync', ids) : null
        if (p && s && !s.why.length && !s.issues.length && !s.capped && (s.ops.length || s.addFk.length || s.delFk.length)) {
          const x = await syncPhy(areaId, r.phy_mdl_id!, p.mdl.ver_no, s, auth.user.usr_id)
          if (x !== 'VERSION_CONFLICT') fkSync += x.ops
        }
      }
    } catch (e) {
      console.error('[phy] 자식 테이블 동기화 실패', e)
    }
    await audit({ area_id: areaId, tgt_tp_cd: 'PHY', tgt_id: r.phy_mdl_id!, act_cd: r.created ? 'INS' : 'UPD', aftr_val: { prj_id: prjId, dbms_cd: dbms, ent_ids: b.ent_ids, tbl: r.tbl, fk: r.fk, ...(fkSync ? { fk_sync_ops: fkSync } : {}), ...(relExc ? { no_rel_exc: noRel } : {}) }, usr_id: auth.user.usr_id })
    return NextResponse.json({ ok: true, item: { phy_mdl_id: r.phy_mdl_id }, created: r.created, tbl_cnt: r.tbl, fk_cnt: r.fk, fk_sync: fkSync }, { status: 201 })
  } catch (e) {
    const x = e as { code?: string; message?: string }
    return dbError(x, uqHit(x.message, UQ.PHY_MDL_DBMS) ? 'PHY_DUP' : 'INVALID_INPUT') // 프로젝트 × DBMS 중복만 PHY_DUP
  }
}

// 칼럼 편집(cols) 또는 테이블 옵션(auto_inc_yn : 단일 정수 PK 자동 증가, sql/036) — 둘 중 하나 이상
const patchBody = z.object({
  phy_mdl_id: z.string().uuid(),
  phy_tbl_id: z.string().uuid(),
  auto_inc_yn: z.enum(['Y', 'N']).optional(),
  cols: z
    .array(
      z.object({
        phy_col_id: z.string().uuid(),
        ver_no: z.number().int(),
        col_seq: z.number().int().min(1).max(10000).optional(),
        null_yn: z.enum(['Y', 'N']).optional(),
        bsc_val_txt: z.string().max(200).nullable().optional(),
      }),
    )
    .max(1000)
    .default([]),
}).refine((b) => b.cols.length > 0 || b.auto_inc_yn !== undefined)

export async function PATCH(req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'MODEL_EDIT')
  if (auth instanceof NextResponse) return auth
  if (!uuid.safeParse(prjId).success) return apiError('INVALID_INPUT', 400)
  const b = await parseBody(req, patchBody)
  if (b instanceof NextResponse) return b
  try {
    const p = await loadPhy(areaId, b.phy_mdl_id)
    if (!p || p.mdl.prj_id !== prjId) return apiError('NOT_FOUND', 404)
    const t = p.tables.find((x) => x.phy_tbl_id === b.phy_tbl_id)
    if (!t) return apiError('NOT_FOUND', 404)
    // 테이블 옵션 : 자동 증가는 단일 정수 PK(관계 상속 아님)만 — 판정은 DDL 생성과 같은 autoIncCol
    if (b.auto_inc_yn !== undefined) {
      if (b.auto_inc_yn === 'Y') {
        const x = await phyDdlInput(areaId, prjId, p)
        const dt = x?.d.tables.find((y) => y.ent_id === t.ent_id)
        if (!x || !dt || !autoIncCol(dt, x.d.fkOf)) return NextResponse.json({ ok: false, code: 'INVALID_INPUT', message: '자동 증가는 단일 정수 PK(소수점 없음·관계로 상속된 칼럼 아님) 테이블만 지정할 수 있습니다' }, { status: 400 })
      }
      const r = await db().from('mdl_phy_tbl').update({ auto_inc_yn: b.auto_inc_yn, ver_no: t.ver_no + 1, modr_id: auth.user.usr_id }).eq('phy_tbl_id', t.phy_tbl_id).eq('ver_no', t.ver_no).select('phy_tbl_id')
      if (r.error) throw r.error
      if (!r.data.length) return apiError('VERSION_CONFLICT', 409)
      await audit({ area_id: areaId, tgt_tp_cd: 'PHY', tgt_id: t.phy_tbl_id, act_cd: 'UPD', bfr_val: { auto_inc_yn: t.auto_inc_yn }, aftr_val: { auto_inc_yn: b.auto_inc_yn }, usr_id: auth.user.usr_id })
      if (!b.cols.length) return NextResponse.json({ ok: true, updated: 0, auto_inc_yn: b.auto_inc_yn })
    }
    const cur = new Map(t.cols.map((c) => [c.phy_col_id, c]))
    if (b.cols.some((e) => cur.get(e.phy_col_id) && cur.get(e.phy_col_id)!.ver_no !== e.ver_no)) return apiError('VERSION_CONFLICT', 409)
    const edits = b.cols.map(({ ver_no: _v, ...e }) => ({ ...e, bsc_val_txt: e.bsc_val_txt === '' ? null : e.bsc_val_txt }))
    const bad = checkColEdits(t.cols, edits, p.mdl.dbms_cd as DbmsCd)
    if (bad) return apiError(bad, 400)
    // ponytail: 칼럼별 update(무트랜잭션) — 각 행 ver_no 조건으로 경합 감지, 중간 충돌 시 앞 행은 반영됨(다시 불러와 재시도)
    const done: string[] = []
    for (const e of edits) {
      const o = cur.get(e.phy_col_id)!
      const { phy_col_id: _id, ...set } = e
      const r = await db().from('mdl_phy_col').update({ ...set, ver_no: o.ver_no + 1, modr_id: auth.user.usr_id }).eq('phy_col_id', e.phy_col_id).eq('ver_no', o.ver_no).select('phy_col_id')
      if (r.error) throw r.error
      if (!r.data.length) return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: errMsg('VERSION_CONFLICT'), done }, { status: 409 })
      done.push(e.phy_col_id)
    }
    await audit({ area_id: areaId, tgt_tp_cd: 'PHY', tgt_id: b.phy_tbl_id, act_cd: 'UPD', bfr_val: edits.map((e) => ({ ...e, bfr: cur.get(e.phy_col_id) && { col_seq: cur.get(e.phy_col_id)!.col_seq, null_yn: cur.get(e.phy_col_id)!.null_yn, bsc_val_txt: cur.get(e.phy_col_id)!.bsc_val_txt } })), aftr_val: edits, usr_id: auth.user.usr_id })
    return NextResponse.json({ ok: true, updated: done.length })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'MODEL_EDIT')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const mdlId = sp.get('mdl')
  const ver = Number(sp.get('ver_no'))
  if (!uuid.safeParse(prjId).success || !uuid.safeParse(mdlId).success || !Number.isInteger(ver)) return apiError('INVALID_INPUT', 400)
  try {
    const p = await loadPhy(areaId, mdlId!)
    if (!p || p.mdl.prj_id !== prjId) return apiError('NOT_FOUND', 404)
    if (p.mdl.ver_no !== ver) return apiError('VERSION_CONFLICT', 409)
    // 작성완료 테이블은 잠금 — 모델만 지워지고 테이블이 잠긴 채 남지 않게 먼저 거부
    const locked = p.tables.filter((t) => t.phy_sts_cd === 'CMPTN')
    if (locked.length) return NextResponse.json({ ok: false, code: 'SUBJ_LOCKED', message: errMsg('SUBJ_LOCKED'), why: [`작성완료 테이블 ${locked.length}개(${locked.slice(0, 3).map((t) => t.tbl_nm).join(', ')}) — 테이블 완료 취소 후 삭제`] }, { status: 409 })
    await delPhy(mdlId!, auth.user.usr_id)
    await audit({ area_id: areaId, tgt_tp_cd: 'PHY', tgt_id: mdlId!, act_cd: 'DEL', bfr_val: { dbms_cd: p.mdl.dbms_cd, tbl: p.tables.length }, usr_id: auth.user.usr_id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
