// 엔터티 속성(MD3, sql/025) — GET 목록(조회 권한, PK 먼저·용어·도메인 포함), POST { term_id, pk_yn?, esntl_yn?, fk_rel_id?, src_attr_id?, attr_desc? } 등록(신청 권한)
// 속성 = 승인완료 표준용어만(같은 분류체계), PK 는 필수로 강제·PK 순서 자동, 상속 관계는 이 엔터티가 자식인 관계만, 감사 이력 ATTR
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { apiError, audit, dbError, parseBody, requireAreaRole } from '@/lib/api'
import { getEnt, listAttrs, nextSeq } from '@/lib/model-attr'

type Ctx = { params: Promise<{ areaId: string; entId: string }> }
const YN = z.enum(['Y', 'N'])
const schema = z.object({
  term_id: z.string().uuid(),
  pk_yn: YN.optional(),
  esntl_yn: YN.optional(),
  fk_rel_id: z.string().uuid().nullable().optional(),
  src_attr_id: z.string().uuid().nullable().optional(), // 상속 원천 = 관계 부모의 주식별자(역할명 상속, sql/027)
  attr_desc: z.string().trim().max(4000).nullable().optional(),
})

export async function GET(_req: Request, { params }: Ctx) {
  const { areaId, entId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  if (!z.string().uuid().safeParse(entId).success) return apiError('INVALID_INPUT', 400)
  try {
    return NextResponse.json({ ok: true, items: await listAttrs(areaId, entId) })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const { areaId, entId } = await params
  const auth = await requireAreaRole(areaId, 'REQUEST')
  if (auth instanceof NextResponse) return auth
  const b = await parseBody(req, schema)
  if (b instanceof NextResponse) return b
  try {
    const ent = await getEnt(areaId, entId)
    if (!ent) return apiError('NOT_FOUND', 404)
    const t = await db().from('std_term').select('term_id, term_log_nm').eq('term_id', b.term_id).eq('area_id', areaId).eq('del_yn', 'N').eq('std_sts_cd', 'CNFM').maybeSingle()
    if (t.error) throw t.error
    if (!t.data) return apiError('ATTR_TERM_INVALID', 400)
    if (b.src_attr_id && !b.fk_rel_id) return apiError('ATTR_SRC_INVALID', 400)
    if (b.fk_rel_id) {
      const r = await db().from('mdl_rel').select('rel_id, prnt_ent_id').eq('rel_id', b.fk_rel_id).eq('chld_ent_id', entId).eq('del_yn', 'N').maybeSingle()
      if (r.error) throw r.error
      if (!r.data) return apiError('INVALID_INPUT', 400)
      if (b.src_attr_id) {
        const s = await db().from('mdl_attr').select('attr_id').eq('attr_id', b.src_attr_id).eq('ent_id', r.data.prnt_ent_id).eq('pk_yn', 'Y').eq('del_yn', 'N').maybeSingle()
        if (s.error) throw s.error
        if (!s.data) return apiError('ATTR_SRC_INVALID', 400)
      }
    }
    const pk = b.pk_yn === 'Y'
    if (pk && b.esntl_yn === 'N') return apiError('ATTR_PK_ESNTL', 400)
    const seq = await nextSeq(entId)
    const uid = auth.user.usr_id
    const row = {
      area_id: areaId,
      ent_id: entId,
      term_id: b.term_id,
      attr_seq: seq.attr,
      pk_yn: pk ? 'Y' : 'N',
      pk_seq: pk ? seq.pk : null,
      esntl_yn: pk || b.esntl_yn === 'Y' ? 'Y' : 'N',
      fk_rel_id: b.fk_rel_id ?? null,
      src_attr_id: b.src_attr_id ?? null,
      attr_desc: b.attr_desc ?? null,
      regr_id: uid,
      modr_id: uid,
    }
    const { data, error } = await db().from('mdl_attr').insert(row).select('attr_id, ver_no').single()
    if (error) return dbError(error, 'ATTR_DUP')
    await audit({ area_id: areaId, tgt_tp_cd: 'ATTR', tgt_id: data.attr_id, act_cd: 'INS', aftr_val: { ...row, term_log_nm: t.data.term_log_nm, ent_log_nm: ent.ent_log_nm }, usr_id: uid })
    return NextResponse.json({ ok: true, item: { ...data, term_log_nm: t.data.term_log_nm } }, { status: 201 })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
