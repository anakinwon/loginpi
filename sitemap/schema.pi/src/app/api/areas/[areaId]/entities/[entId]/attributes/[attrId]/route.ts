// 엔터티 속성 수정·삭제 — PATCH { ver_no, term_id?, pk_yn?, esntl_yn?, attr_desc? }(용어 교체 = 승인 용어·자리·PK·필수 유지, 관계 상속 속성은 교체 불가 / PK 지정 시 필수 강제·PK 순서 자동, PK 해제 시 순서 비움) / DELETE ?ver_no= 논리 삭제. 신청 권한, 감사 이력 ATTR
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { apiError, audit, dbError, requireAreaRole } from '@/lib/api'
import { nextSeq } from '@/lib/model-attr'

type Ctx = { params: Promise<{ areaId: string; entId: string; attrId: string }> }
const YN = z.enum(['Y', 'N'])
const schema = z
  .object({ ver_no: z.coerce.number().int().positive(), term_id: z.string().uuid().optional(), propagate: z.boolean().optional(), pk_yn: YN.optional(), esntl_yn: YN.optional(), attr_desc: z.string().trim().max(4000).nullable().optional(), attr_asst_nm: z.string().trim().max(200).nullable().optional() })
  .strict()

// 이 속성을 원천으로 같은 용어로 상속한 후손 속성 전부(식별 관계 체인의 손자 이하 포함, PRD_PiErd S1 L1·D4) — 역할명 상속(다른 용어)은 제외
// ponytail: 단계별 조회(최대 10단계) — 모델 깊이가 이를 넘으면 재귀 CTE RPC 로
const HEIR_DEPTH = 10
async function sameTermHeirs(areaId: string, attrId: string, termId: string) {
  const out: { attr_id: string; ent_id: string; ver_no: number; mdl_ent: { ent_log_nm: string } | null }[] = []
  let front = [attrId]
  for (let d = 0; d < HEIR_DEPTH && front.length; d++) {
    const { data, error } = await db()
      .from('mdl_attr')
      .select('attr_id, ent_id, ver_no, mdl_ent!mdl_attr_mdl_ent_id_fkey(ent_log_nm)')
      .eq('area_id', areaId)
      .in('src_attr_id', front)
      .eq('term_id', termId)
      .eq('del_yn', 'N')
    if (error) throw error
    const rows = (data as unknown as typeof out).filter((x) => !out.some((o) => o.attr_id === x.attr_id))
    out.push(...rows)
    front = rows.map((x) => x.attr_id)
  }
  return out
}

export async function GET(_req: Request, { params }: Ctx) {
  const { areaId, entId, attrId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  if (!z.string().uuid().safeParse(attrId).success) return apiError('INVALID_INPUT', 400)
  try {
    const cur = await current(areaId, entId, attrId)
    if (!cur) return apiError('NOT_FOUND', 404)
    const h = await sameTermHeirs(areaId, attrId, cur.term_id as string)
    return NextResponse.json({ ok: true, heirs: h.map((x) => ({ attr_id: x.attr_id, ent_log_nm: x.mdl_ent?.ent_log_nm ?? '' })) })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

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
    const set = { ...(swap ? { term_id: swap } : {}), pk_yn: pk ? 'Y' : 'N', pk_seq: pkSeq, esntl_yn: esntl, ...(b.data.attr_desc !== undefined ? { attr_desc: b.data.attr_desc } : {}), ...(b.data.attr_asst_nm !== undefined ? { attr_asst_nm: b.data.attr_asst_nm || null } : {}), ver_no: b.data.ver_no + 1, modr_id: uid }
    const { data, error } = await db().from('mdl_attr').update(set).eq('attr_id', attrId).eq('ver_no', b.data.ver_no).eq('del_yn', 'N').select('attr_id, term_id, ver_no, pk_yn, pk_seq, esntl_yn, attr_desc')
    if (error) return dbError(error, 'ATTR_DUP')
    if (!data.length) return apiError('VERSION_CONFLICT', 409)
    await audit({ area_id: areaId, tgt_tp_cd: 'ATTR', tgt_id: attrId, act_cd: 'UPD', bfr_val: cur, aftr_val: { ...cur, ...set }, usr_id: uid })
    // 부모 식별자 용어 교체 → 같은 용어로 상속한 자식 속성도 교체(사용자가 미리보기 후 propagate 선택)
    let propagated = 0
    const pfail: string[] = []
    if (swap && b.data.propagate) {
      for (const h of await sameTermHeirs(areaId, attrId, cur.term_id as string)) {
        const u = await db().from('mdl_attr').update({ term_id: swap, ver_no: h.ver_no + 1, modr_id: uid }).eq('attr_id', h.attr_id).eq('ver_no', h.ver_no).eq('del_yn', 'N').select('attr_id')
        if (u.error || !u.data.length) {
          pfail.push(h.mdl_ent?.ent_log_nm ?? h.attr_id)
          continue
        }
        await audit({ area_id: areaId, tgt_tp_cd: 'ATTR', tgt_id: h.attr_id, act_cd: 'UPD', aftr_val: { term_id: swap, propagated_from: attrId }, usr_id: uid })
        propagated++
      }
    }
    return NextResponse.json({ ok: true, item: data[0], propagated, propagate_fail: pfail })
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
