// 핵심 엔터티 — GET ?subj=&prj=&lvl=CNCP|LGCL|ALL(기본 CNCP)&q=&page=&size= 목록(조회 권한, 주제영역·물리 테이블명 미리보기·등록자 포함), POST { subj_id, dic_ids, ent_tp_cd?, ent_desc?, mdl_lvl_cd? } 등록(신청 권한)
// 이름은 서버가 생성(승인완료 표준단어 결합, 클라이언트 값 불신), 규칙 src/lib/model-name.ts, 저장 = mdl_ent(sql/018), 감사 이력 기록
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { apiError, audit, dbError, parseBody, requireAreaRole } from '@/lib/api'
import { pageRows } from '@/lib/paging'
import { withActors } from '@/lib/approval'
import { entSchema, MDL_LVLS, prepareEnt, type MdlLvl } from '@/lib/model'
import { entNames, type EntWord } from '@/lib/model-name'

type Ctx = { params: Promise<{ areaId: string }> }
const COLS = 'ent_id, subj_id, ent_log_nm, ent_tp_cd, ent_desc, ent_asst_nm, dic_ids, mdl_lvl_cd, ver_no, regr_id, reg_dtm, mdl_subj!inner(subj_nm, subj_abbr_nm, up_subj_id), mdl_prj!mdl_ent_mdl_prj_id_fkey(tbl_pfx_txt, trgt_dbms_cd)'

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const subj = sp.get('subj')
  const prj = sp.get('prj')
  const q = sp.get('q')?.trim()
  // 모델 단계 : 기본 CNCP(개념 화면 기존 동작), ALL = 전체
  const lvlRaw = sp.get('lvl') ?? 'CNCP'
  const lvl = lvlRaw === 'ALL' ? null : (MDL_LVLS as readonly string[]).includes(lvlRaw) ? (lvlRaw as MdlLvl) : 'CNCP'
  // 주제영역 선택 시 그 주제영역과 하위(2레벨) 엔터티
  let subjIds: string[] | null = null
  if (subj && z.string().uuid().safeParse(subj).success) {
    const c = await db().from('mdl_subj').select('subj_id').eq('area_id', areaId).eq('up_subj_id', subj).eq('del_yn', 'N')
    if (c.error) return dbError(c.error)
    subjIds = [subj, ...c.data.map((x) => x.subj_id as string)]
  }
  const build = () => {
    let query = db().from('mdl_ent').select(COLS, { count: 'exact' }).eq('area_id', areaId).eq('del_yn', 'N').order('reg_dtm', { ascending: false }).order('ent_log_nm')
    if (subjIds) query = query.in('subj_id', subjIds)
    if (lvl) query = query.eq('mdl_lvl_cd', lvl)
    if (prj && z.string().uuid().safeParse(prj).success) query = query.eq('prj_id', prj)
    if (q) query = query.ilike('ent_log_nm', `%${q.replace(/[%_,()]/g, '')}%`)
    return query
  }
  const r = await pageRows(build, sp, 1000)
  if (r.error) return dbError(r.error)
  try {
    const rows = r.rows as unknown as { dic_ids: string[]; mdl_subj: { subj_abbr_nm: string }; mdl_prj: { tbl_pfx_txt: string; trgt_dbms_cd: string } | null }[]
    // 물리 테이블명 미리보기 — 현재 페이지 구성 단어를 한 번에 조회
    const ids = [...new Set(rows.flatMap((x) => x.dic_ids))]
    const w = ids.length ? await db().from('std_dic').select('dic_id, dic_log_nm, dic_phy_nm, attr_clss_yn, ent_clss_yn, forbid_yn, tbl_sfx_txt, std_sts_cd, del_yn').in('dic_id', ids) : { data: [], error: null }
    if (w.error) throw w.error
    const by = new Map((w.data as (EntWord & { std_sts_cd: string; del_yn: string })[]).map((x) => [x.dic_id, x]))
    const named = rows.map((x) => {
      const ws = x.dic_ids.map((id) => by.get(id)).filter((v): v is EntWord & { std_sts_cd: string; del_yn: string } => !!v)
      const n = entNames(ws, x.mdl_subj.subj_abbr_nm, x.mdl_prj?.tbl_pfx_txt, x.mdl_prj?.trgt_dbms_cd)
      return { ...x, tbl_phy_nm: n.tbl_phy_nm, too_long: n.too_long, words: ws.map((v) => ({ dic_log_nm: v.dic_log_nm, ok: v.std_sts_cd === 'CNFM' && v.del_yn === 'N' })) }
    })
    const items = await withActors(areaId, 'DIC', 'ent_id', named as unknown as Record<string, unknown>[])
    return NextResponse.json({ ok: true, items, total: r.total, page: r.page, size: r.size })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'REQUEST')
  if (auth instanceof NextResponse) return auth
  const body = await parseBody(req, entSchema)
  if (body instanceof NextResponse) return body
  try {
    const p = await prepareEnt(areaId, body)
    if (typeof p === 'string') return apiError(p, p === 'NOT_FOUND' ? 404 : 400)
    const uid = auth.user.usr_id
    const { data, error } = await db()
      .from('mdl_ent')
      .insert({ area_id: areaId, subj_id: body.subj_id, ent_log_nm: p.ent_log_nm, ent_tp_cd: body.ent_tp_cd, ent_desc: body.ent_desc ?? null, ent_asst_nm: body.ent_asst_nm || null, dic_ids: body.dic_ids, ...(body.mdl_lvl_cd ? { mdl_lvl_cd: body.mdl_lvl_cd } : {}), regr_id: uid, modr_id: uid })
      .select('ent_id, ent_log_nm, mdl_lvl_cd, ver_no')
      .single()
    if (error) return dbError(error, 'ENT_DUP')
    await audit({ area_id: areaId, tgt_tp_cd: 'ENT', tgt_id: data.ent_id, act_cd: 'INS', aftr_val: { ...body, ent_log_nm: p.ent_log_nm, tbl_phy_nm: p.tbl_phy_nm }, usr_id: uid })
    return NextResponse.json({ ok: true, item: { ...data, tbl_phy_nm: p.tbl_phy_nm } }, { status: 201 })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
