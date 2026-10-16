// 분류체계 API — GET 내가 속한 분류체계 목록, POST 분류체계 생성(생성자를 분류체계 관리자로 등록)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { apiError, audit, currentUser, dbError, parseBody } from '@/lib/api'

export async function GET() {
  const user = await currentUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)
  const { data, error } = await db()
    .from('std_area_mbr')
    .select('mbr_role_cd, std_area!inner(area_id, area_nm, area_desc, term_sep_txt, del_yn)')
    .eq('usr_id', user.usr_id)
    .eq('del_yn', 'N')
    .eq('std_area.del_yn', 'N')
  if (error) return dbError(error)
  const areas = (data ?? []).map((r) => ({ ...(r.std_area as unknown as Record<string, unknown>), role: r.mbr_role_cd }))
  return NextResponse.json({ ok: true, areas })
}

const createSchema = z.object({
  area_nm: z.string().trim().min(1).max(200),
  area_desc: z.string().trim().max(4000).optional(),
})

export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)
  const body = await parseBody(req, createSchema)
  if (body instanceof NextResponse) return body
  const { data: area, error } = await db()
    .from('std_area')
    .insert({ ...body, regr_id: user.usr_id, modr_id: user.usr_id })
    .select('area_id, area_nm, area_desc, term_sep_txt')
    .single()
  if (error) return dbError(error, 'AREA_DUP_NM')
  const mbr = await db()
    .from('std_area_mbr')
    .insert({ area_id: area.area_id, usr_id: user.usr_id, mbr_role_cd: 'DA', regr_id: user.usr_id, modr_id: user.usr_id })
  if (mbr.error) return dbError(mbr.error)
  // 행안부 공통표준 도메인그룹 8종 기본 등록(sql/009)
  const seed = await db().rpc('fn_seed_std_dom_grp', { p_area_id: area.area_id, p_usr_id: user.usr_id })
  if (seed.error) return dbError(seed.error)
  await audit({ area_id: area.area_id, tgt_tp_cd: 'AREA', tgt_id: area.area_id, act_cd: 'INS', aftr_val: area, usr_id: user.usr_id })
  return NextResponse.json({ ok: true, area: { ...area, role: 'DA' } }, { status: 201 })
}
