// 리버스(PRD_PiErd S4) — GET : 작업 목록 / ?catalog=DBMS : 카탈로그 조회 SQL(사용자가 자기 DB에서 실행) / ?job= : 스테이징(테이블·칼럼·매핑·관계 후보)
// POST : DDL·카탈로그 CSV 해석 → 표준 용어 역매핑 → 스테이징 저장(서버는 고객 DB에 접속하지 않음)
// PATCH : 모델 반영 출처 기록(화면이 기존 엔터티·속성·관계 API 로 만든 ID) + 작업 상태 APPLIED
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, audit, dbError, parseBody, requireAreaRole } from '@/lib/api'
import { db } from '@/lib/db'
import { listRvs, loadRvs, markRvs, parseSrc, stageRvs } from '@/lib/model-rvs'
import { isDbms, type DbmsCd } from '@/lib/modelpi/dbms'
import { catalogSql } from '@/lib/modelpi/rvs'

type Ctx = { params: Promise<{ areaId: string; prjId: string }> }
const uuid = z.string().uuid()
const TEXT_MAX = 5_000_000 // 5MB(요청 본문 한도 4.5MB 안쪽 실사용)
const postBody = z.object({ src_cd: z.enum(['DDL', 'CSV']), dbms_cd: z.string().refine(isDbms), file_nm: z.string().trim().max(200).nullish(), text: z.string().min(1).max(TEXT_MAX) })
const patchBody = z.object({
  rvs_job_id: uuid,
  tbls: z.array(z.object({ rvs_tbl_id: uuid, ent_id: uuid })).max(5000),
  cols: z.array(z.object({ rvs_col_id: uuid, attr_id: uuid.nullish(), rel_id: uuid.nullish() })).max(50000),
})

async function prjOk(areaId: string, prjId: string) {
  const r = await db().from('mdl_prj').select('prj_id').eq('prj_id', prjId).eq('area_id', areaId).eq('del_yn', 'N').maybeSingle()
  if (r.error) throw r.error
  return !!r.data
}

export async function GET(req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  if (!uuid.safeParse(prjId).success) return apiError('INVALID_INPUT', 400)
  const sp = new URL(req.url).searchParams
  const cat = sp.get('catalog')
  if (cat !== null) return isDbms(cat) ? new NextResponse(catalogSql(cat), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } }) : apiError('INVALID_INPUT', 400)
  try {
    if (!(await prjOk(areaId, prjId))) return apiError('NOT_FOUND', 404)
    const job = sp.get('job')
    if (job) {
      if (!uuid.safeParse(job).success) return apiError('INVALID_INPUT', 400)
      const d = await loadRvs(areaId, prjId, job)
      return d ? NextResponse.json({ ok: true, ...d }) : apiError('NOT_FOUND', 404)
    }
    return NextResponse.json({ ok: true, items: await listRvs(areaId, prjId) })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'REQUEST')
  if (auth instanceof NextResponse) return auth
  if (!uuid.safeParse(prjId).success) return apiError('INVALID_INPUT', 400)
  const b = await parseBody(req, postBody)
  if (b instanceof NextResponse) return b
  try {
    if (!(await prjOk(areaId, prjId))) return apiError('NOT_FOUND', 404)
    const r = parseSrc(b.src_cd, b.text)
    if ('missing' in r) return NextResponse.json({ ok: false, code: 'INVALID_INPUT', message: `CSV 머리글이 없습니다 : ${r.missing.join(', ')}`, missing: r.missing }, { status: 400 })
    // 저장 칼럼 한도(VARCHAR(128))·NUL 문자 — DB 오류(500) 대신 400
    const NUL = String.fromCharCode(0)
    const longNm = [...r.tables.flatMap((t) => [t.name, ...t.cols.map((c) => c.name)]), ...r.fks.flatMap((f) => [f.name ?? '', f.ref_table, ...f.ref_cols])].filter((n) => n.length > 128)
    if (longNm.length) return NextResponse.json({ ok: false, code: 'INVALID_INPUT', message: `이름이 128자를 넘습니다 : ${longNm.slice(0, 3).join(', ').slice(0, 200)}` }, { status: 400 })
    if (b.text.includes(NUL)) return NextResponse.json({ ok: false, code: 'INVALID_INPUT', message: '파일에 NUL 문자가 있습니다(텍스트 DDL·CSV 만 올리십시오)' }, { status: 400 })
    if (!r.tables.length) return NextResponse.json({ ok: false, code: 'INVALID_INPUT', message: '해석된 테이블이 없습니다(CREATE TABLE 또는 카탈로그 CSV 행 필요)', warnings: r.warnings }, { status: 400 })
    const s = await stageRvs(areaId, prjId, { src: b.src_cd, dbms: b.dbms_cd as DbmsCd, fileNm: b.file_nm ?? null }, r, auth.user.usr_id)
    await audit({ area_id: areaId, tgt_tp_cd: 'RVS', tgt_id: s.rvs_job_id, act_cd: 'INS', aftr_val: { prj_id: prjId, src_cd: b.src_cd, tbl: s.tbl_cnt, col: s.col_cnt, mapped: s.mapped }, usr_id: auth.user.usr_id })
    return NextResponse.json({ ok: true, ...s, warnings: r.warnings, skipped: r.skipped }, { status: 201 })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'REQUEST')
  if (auth instanceof NextResponse) return auth
  if (!uuid.safeParse(prjId).success) return apiError('INVALID_INPUT', 400)
  const b = await parseBody(req, patchBody)
  if (b instanceof NextResponse) return b
  try {
    const j = await db().from('mdl_rvs_job').select('rvs_job_id').eq('rvs_job_id', b.rvs_job_id).eq('prj_id', prjId).eq('area_id', areaId).eq('del_yn', 'N').maybeSingle()
    if (j.error) throw j.error
    if (!j.data) return apiError('NOT_FOUND', 404)
    // 출처 ID 소속 — 이 프로젝트의 활성 엔터티·속성·관계만(다른 프로젝트 ID 포인터 기록 방지)
    const own = async (tb: string, key: string, ids: string[]) => {
      const u = [...new Set(ids)]
      for (let i = 0; i < u.length; i += 100) {
        const r = await db().from(tb).select(key).in(key, u.slice(i, i + 100)).eq('prj_id', prjId).eq('area_id', areaId).eq('del_yn', 'N')
        if (r.error) throw r.error
        if ((r.data ?? []).length !== u.slice(i, i + 100).length) return false
      }
      return true
    }
    const ok =
      (await own('mdl_ent', 'ent_id', b.tbls.map((t) => t.ent_id))) &&
      (await own('mdl_attr', 'attr_id', b.cols.flatMap((c) => (c.attr_id ? [c.attr_id] : [])))) &&
      (await own('mdl_rel', 'rel_id', b.cols.flatMap((c) => (c.rel_id ? [c.rel_id] : []))))
    if (!ok) return apiError('INVALID_INPUT', 400)
    await markRvs(areaId, b.rvs_job_id, { tbls: b.tbls, cols: b.cols }, auth.user.usr_id)
    await audit({ area_id: areaId, tgt_tp_cd: 'RVS', tgt_id: b.rvs_job_id, act_cd: 'UPD', aftr_val: { applied_tbl: b.tbls.length, applied_col: b.cols.length }, usr_id: auth.user.usr_id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
