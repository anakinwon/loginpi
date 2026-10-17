// 엔터티 속성 수정·삭제 — PATCH { ver_no, term_id?, pk_yn?, esntl_yn?, attr_desc? }(용어 교체 = 승인 용어·자리·PK·필수 유지, 관계 상속 속성은 교체 불가 / PK 지정 시 필수 강제·PK 순서 자동, PK 해제 시 순서 비움) / DELETE ?ver_no= 논리 삭제. 신청 권한, 감사 이력 ATTR
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { apiError, audit, dbError, requireAreaRole } from '@/lib/api'
import { nextSeq } from '@/lib/model-attr'

type Ctx = { params: Promise<{ areaId: string; entId: string; attrId: string }> }
const YN = z.enum(['Y', 'N'])
const schema = z
  .object({ ver_no: z.coerce.number().int().positive(), term_id: z.string().uuid().optional(), pk_yn: YN.optional(), esntl_yn: YN.optional(), attr_desc: z.string().trim().max(4000).nullable().optional() })
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
    // 용어 교체 : 승인완료 용어(같은 분류체계)만, 활성 관계로 상속된 FK 속성은 잠금(부모 식별자와 일치해야 함)
    const swap = b.data.term_id && b.data.term_id !== cur.term_id ? b.data.term_id : null
    if (swap) {
      if (cur.fk_rel_id) {
        const r = await db().from('mdl_rel').select('rel_id').eq('rel_id', cur.fk_rel_id as string).eq('del_yn', 'N').maybeSingle()
        if (r.error) throw r.error
        if (r.data) return apiError('ATTR_FK_LOCKED', 400)
      }
      const t = await db().from('std_term').select('term_id').eq('term_id', swap).eq('area_id', areaId).eq('del_yn', 'N').eq('std_sts_cd', 'CNFM').maybeSingle()
      if (t.error) throw t.error
      if (!t.data) return apiError('ATTR_TERM_INVALID', 400)
    }
    const uid = auth.user.usr_id
    const set = { ...(swap ? { term_id: swap } : {}), pk_yn: pk ? 'Y' : 'N', pk_seq: pkSeq, esntl_yn: esntl, ...(b.data.attr_desc !== undefined ? { attr_desc: b.data.attr_desc } : {}), ver_no: b.data.ver_no + 1, modr_id: uid }
    const { data, error } = await db().from('mdl_attr').update(set).eq('attr_id', attrId).eq('ver_no', b.data.ver_no).eq('del_yn', 'N').select('attr_id, term_id, ver_no, pk_yn, pk_seq, esntl_yn, attr_desc')
    if (error) return dbError(error, 'ATTR_DUP')
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
