// 분류체계 멤버 API — GET 목록(조회 권한), POST { pi_usr_nm, mbr_role_cd } 추가 · PATCH { mbr_id, mbr_role_cd } 역할 변경(설정 권한, 가입된 사용자만)
//  권한 상승 방지(2026-10-18) : 지정할 역할·바꿀 대상의 현재 역할 모두 본인 역할 권한 안이어야 함(roles.ts canAssign — MDL 이 DA 지정·DA 강등 불가)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { can, canAssign, ROLES } from '@/lib/roles'
import { apiError, audit, dbError, parseBody, requireAreaRole } from '@/lib/api'

type Ctx = { params: Promise<{ areaId: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  const { data, error } = await db()
    .from('std_area_mbr')
    .select('mbr_id, mbr_role_cd, sys_user!inner(usr_id, pi_usr_nm, dsp_nm)')
    .eq('area_id', areaId)
    .eq('del_yn', 'N')
    .order('reg_dtm')
  if (error) return dbError(error)
  return NextResponse.json({ ok: true, members: data })
}

const addSchema = z.object({
  pi_usr_nm: z.string().trim().min(1).max(100),
  mbr_role_cd: z.enum(ROLES),
})

export async function POST(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'SETTINGS')
  if (auth instanceof NextResponse) return auth
  const body = await parseBody(req, addSchema)
  if (body instanceof NextResponse) return body
  if (!canAssign(auth.role, body.mbr_role_cd)) return apiError('ROLE_ESCALATE', 403)
  const u = await db().from('sys_user').select('usr_id').eq('pi_usr_nm', body.pi_usr_nm).eq('del_yn', 'N').maybeSingle()
  if (u.error) return dbError(u.error)
  if (!u.data) return apiError('NOT_FOUND', 404)
  const { data, error } = await db()
    .from('std_area_mbr')
    .insert({ area_id: areaId, usr_id: u.data.usr_id, mbr_role_cd: body.mbr_role_cd, regr_id: auth.user.usr_id, modr_id: auth.user.usr_id })
    .select('mbr_id, mbr_role_cd')
    .single()
  if (error) return dbError(error, 'MBR_DUP')
  await audit({ area_id: areaId, tgt_tp_cd: 'MBR', tgt_id: data.mbr_id, act_cd: 'INS', aftr_val: { ...body }, usr_id: auth.user.usr_id })
  return NextResponse.json({ ok: true, member: data }, { status: 201 })
}

// 역할 변경 — PATCH { mbr_id, mbr_role_cd } : 설정 권한. 설정 권한자가 0명이 되는 변경은 거부(분류체계 관리 불능 방지)
const roleSchema = z.object({ mbr_id: z.string().uuid(), mbr_role_cd: z.enum(ROLES) })

export async function PATCH(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'SETTINGS')
  if (auth instanceof NextResponse) return auth
  const body = await parseBody(req, roleSchema)
  if (body instanceof NextResponse) return body
  const all = await db().from('std_area_mbr').select('mbr_id, mbr_role_cd').eq('area_id', areaId).eq('del_yn', 'N')
  if (all.error) return dbError(all.error)
  const cur = all.data.find((m) => m.mbr_id === body.mbr_id)
  if (!cur) return apiError('NOT_FOUND', 404)
  if (cur.mbr_role_cd === body.mbr_role_cd) return apiError('NO_CHANGE', 400)
  if (!canAssign(auth.role, cur.mbr_role_cd, body.mbr_role_cd)) return apiError('ROLE_ESCALATE', 403)
  if (!all.data.some((m) => (m.mbr_id === body.mbr_id ? can(body.mbr_role_cd, 'SETTINGS') : can(m.mbr_role_cd, 'SETTINGS')))) return apiError('LAST_SETTINGS_ROLE', 409)
  const { error } = await db().from('std_area_mbr').update({ mbr_role_cd: body.mbr_role_cd, modr_id: auth.user.usr_id }).eq('mbr_id', body.mbr_id)
  if (error) return dbError(error)
  await audit({ area_id: areaId, tgt_tp_cd: 'MBR', tgt_id: body.mbr_id, act_cd: 'UPD', bfr_val: { mbr_role_cd: cur.mbr_role_cd }, aftr_val: { mbr_role_cd: body.mbr_role_cd }, usr_id: auth.user.usr_id })
  return NextResponse.json({ ok: true })
}
