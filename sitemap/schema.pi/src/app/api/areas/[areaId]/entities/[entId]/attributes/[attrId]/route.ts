// 엔터티 속성 수정·삭제 — PATCH { ver_no, pk_yn?, esntl_yn?, attr_desc? }(PK 지정 시 필수 강제·PK 순서 자동, PK 해제 시 순서 비움) / DELETE ?ver_no= 논리 삭제. 신청 권한, 감사 이력 ATTR
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { apiError, audit, dbError, requireAreaRole } from '@/lib/api'
import { nextSeq } from '@/lib/model-attr'

type Ctx = { params: Promise<{ areaId: string; entId: string; attrId: string }> }
const YN = z.enum(['Y', 'N'])
const schema = z
  .object({ ver_no: z.coerce.number().int().positive(), pk_yn: YN.optional(), esntl_yn: YN.optional(), attr_desc: z.string().trim().max(4000).nullable().optional() })
  .strict()

async function current(areaId: string, entId: string, attrId: string) {
  const { data, error } = await db().from('mdl_attr').select('*').eq('attr_id', attrId).eq('ent_id', entId).eq('area_id', areaId).eq('del_yn', 'N').maybeSingle()
  if (error) throw error
  return data as Record<string, unknown> | null
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { areaId, entId, attrId } = await params
  const auth = await requireAreaRole(areaId, 'REQUEST')
  if (auth instanceof NextResponse) return auth
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return apiError('INVALID_INPUT', 400)
  }
  const b = schema.safeParse(raw)
  if (!b.success || !z.string().uuid().safeParse(attrId).success) return apiError('INVALID_INPUT', 400)
  try {
    const cur = await current(areaId, entId, attrId)
    if (!cur) return apiError('NOT_FOUND', 404)
    if (cur.ver_no !== b.data.ver_no) return apiError('VERSION_CONFLICT', 409)
    const pk = (b.data.pk_yn ?? cur.pk_yn) === 'Y'
    if (pk && b.data.esntl_yn === 'N') return apiError('ATTR_PK_ESNTL', 400)
    const esntl = pk ? 'Y' : (b.data.esntl_yn ?? (cur.esntl_yn as string))
    const pkSeq = pk ? ((cur.pk_seq as number | null) ?? (await nextSeq(entId)).pk) : null
    const uid = auth.user.usr_id
    const set = { pk_yn: pk ? 'Y' : 'N', pk_seq: pkSeq, esntl_yn: esntl, ...(b.data.attr_desc !== undefined ? { attr_desc: b.data.attr_desc } : {}), ver_no: b.data.ver_no + 1, modr_id: uid }
    const { data, error } = await db().from('mdl_attr').update(set).eq('attr_id', attrId).eq('ver_no', b.data.ver_no).eq('del_yn', 'N').select('attr_id, ver_no, pk_yn, pk_seq, esntl_yn')
    if (error) return dbError(error)
    if (!data.length) return apiError('VERSION_CONFLICT', 409)
    await audit({ area_id: areaId, tgt_tp_cd: 'ATTR', tgt_id: attrId, act_cd: 'UPD', bfr_val: cur, aftr_val: { ...cur, ...set }, usr_id: uid })
    return NextResponse.json({ ok: true, item: data[0] })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { areaId, entId, attrId } = await params
  const auth = await requireAreaRole(areaId, 'REQUEST')
  if (auth instanceof NextResponse) return auth
  const v = z.coerce.number().int().positive().safeParse(new URL(req.url).searchParams.get('ver_no'))
  if (!v.success || !z.string().uuid().safeParse(attrId).success) return apiError('INVALID_INPUT', 400)
  try {
    const cur = await current(areaId, entId, attrId)
    if (!cur) return apiError('NOT_FOUND', 404)
    const uid = auth.user.usr_id
    const { data, error } = await db().from('mdl_attr').update({ del_yn: 'Y', del_dtm: new Date().toISOString(), ver_no: v.data + 1, modr_id: uid }).eq('attr_id', attrId).eq('ver_no', v.data).eq('del_yn', 'N').select('attr_id')
    if (error) return dbError(error)
    if (!data.length) return apiError('VERSION_CONFLICT', 409)
    await audit({ area_id: areaId, tgt_tp_cd: 'ATTR', tgt_id: attrId, act_cd: 'DEL', bfr_val: cur, usr_id: uid })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
