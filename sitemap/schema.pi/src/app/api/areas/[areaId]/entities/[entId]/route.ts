// 엔터티 수정·삭제 — PATCH { ver_no, subj_id, dic_ids, ent_tp_cd?, ent_desc?, mdl_lvl_cd? } 이름 재생성·규칙 재검증·주제영역은 같은 프로젝트 안 이동만 / DELETE ?ver_no= 논리 삭제(속성·관계 연쇄). 신청 권한, 감사 이력(변경 전후)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { apiError, audit, dbError, requireAreaRole } from '@/lib/api'
import { entSchema, prepareEnt } from '@/lib/model'

type Ctx = { params: Promise<{ areaId: string; entId: string }> }
const verSchema = z.coerce.number().int().positive()

async function current(areaId: string, id: string) {
  const { data, error } = await db().from('mdl_ent').select('*').eq('ent_id', id).eq('area_id', areaId).eq('del_yn', 'N').maybeSingle()
  if (error) throw error
  return data as Record<string, unknown> | null
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { areaId, entId } = await params
  const auth = await requireAreaRole(areaId, 'REQUEST')
  if (auth instanceof NextResponse) return auth
  let raw: Record<string, unknown>
  try {
    raw = await req.json()
  } catch {
    return apiError('INVALID_INPUT', 400)
  }
  const { ver_no, ...input } = raw ?? {}
  const v = verSchema.safeParse(ver_no)
  const b = entSchema.safeParse(input)
  if (!v.success || !b.success || !z.string().uuid().safeParse(entId).success) return apiError('INVALID_INPUT', 400)
  try {
    const cur = await current(areaId, entId)
    if (!cur) return apiError('NOT_FOUND', 404)
    if (cur.ver_no !== v.data) return apiError('VERSION_CONFLICT', 409)
    // 주제영역 이동은 같은 프로젝트 안에서만(관계·속성이 프로젝트 단위)
    if (b.data.subj_id !== cur.subj_id) {
      const s = await db().from('mdl_subj').select('prj_id').eq('subj_id', b.data.subj_id).eq('area_id', areaId).eq('del_yn', 'N').maybeSingle()
      if (s.error) throw s.error
      if (!s.data) return apiError('NOT_FOUND', 404)
      if (s.data.prj_id !== cur.prj_id) return apiError('ENT_SUBJ_PRJ', 400)
    }
    const p = await prepareEnt(areaId, b.data)
    if (typeof p === 'string') return apiError(p, p === 'NOT_FOUND' ? 404 : 400)
    const uid = auth.user.usr_id
    const set = { subj_id: b.data.subj_id, ent_log_nm: p.ent_log_nm, ent_tp_cd: b.data.ent_tp_cd, ent_desc: b.data.ent_desc ?? null, dic_ids: b.data.dic_ids, ...(b.data.mdl_lvl_cd ? { mdl_lvl_cd: b.data.mdl_lvl_cd } : {}), ver_no: v.data + 1, modr_id: uid }
    const { data, error } = await db().from('mdl_ent').update(set).eq('ent_id', entId).eq('ver_no', v.data).eq('del_yn', 'N').select('ent_id, ent_log_nm, mdl_lvl_cd, ver_no')
    if (error) return dbError(error, 'ENT_DUP')
    if (!data.length) return apiError('VERSION_CONFLICT', 409)
    await audit({ area_id: areaId, tgt_tp_cd: 'ENT', tgt_id: entId, act_cd: 'UPD', bfr_val: cur, aftr_val: { ...set, tbl_phy_nm: p.tbl_phy_nm }, usr_id: uid })
    return NextResponse.json({ ok: true, item: { ...data[0], tbl_phy_nm: p.tbl_phy_nm } })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { areaId, entId } = await params
  const auth = await requireAreaRole(areaId, 'REQUEST')
  if (auth instanceof NextResponse) return auth
  const v = verSchema.safeParse(new URL(req.url).searchParams.get('ver_no'))
  if (!v.success || !z.string().uuid().safeParse(entId).success) return apiError('INVALID_INPUT', 400)
  try {
    const cur = await current(areaId, entId)
    if (!cur) return apiError('NOT_FOUND', 404)
    const uid = auth.user.usr_id
    const { data, error } = await db().from('mdl_ent').update({ del_yn: 'Y', del_dtm: new Date().toISOString(), ver_no: v.data + 1, modr_id: uid }).eq('ent_id', entId).eq('ver_no', v.data).eq('del_yn', 'N').select('ent_id')
    if (error) return dbError(error)
    if (!data.length) return apiError('VERSION_CONFLICT', 409)
    // 엔터티 속성(sql/025)·관계(sql/021, 부모·자식 어느 쪽이든)도 함께 논리 삭제(고아 방지)
    const now = new Date().toISOString()
    const [at, rl] = await Promise.all([
      db().from('mdl_attr').update({ del_yn: 'Y', del_dtm: now, modr_id: uid }).eq('ent_id', entId).eq('del_yn', 'N'),
      db().from('mdl_rel').update({ del_yn: 'Y', del_dtm: now, modr_id: uid }).or(`prnt_ent_id.eq.${entId},chld_ent_id.eq.${entId}`).eq('del_yn', 'N'),
    ])
    if (at.error) console.error('[entities/delete] 속성 논리 삭제 실패', entId, at.error.message)
    if (rl.error) console.error('[entities/delete] 관계 논리 삭제 실패', entId, rl.error.message)
    await audit({ area_id: areaId, tgt_tp_cd: 'ENT', tgt_id: entId, act_cd: 'DEL', bfr_val: cur, usr_id: uid })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
