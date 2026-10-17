// 엔터티 관계 조회·수정·삭제 — GET 상속 속성 미리보기 / PATCH { ver_no, ...바뀐 항목 } 규칙 재검증(현재 행과 합침) / DELETE ?ver_no=&fk=keep|del 논리 삭제
// 관계를 지우면 그 관계로 상속한 자식 속성(fk_rel_id)도 처리 : keep(기본) = 일반 속성으로 전환, del = 함께 논리 삭제 (PRD_PiErd S0 D1). 신청 권한, 감사 이력
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { apiError, audit, dbError, requireAreaRole } from '@/lib/api'
import { relCrud } from '@/lib/model'

type Ctx = { params: Promise<{ areaId: string; relId: string }> }

// 관계로 상속한 활성 속성(자식 엔터티·용어)
async function fkAttrs(areaId: string, relId: string) {
  const { data, error } = await db()
    .from('mdl_attr')
    .select('attr_id, ent_id, pk_yn, std_term!mdl_attr_std_term_id_fkey(term_log_nm), mdl_ent!mdl_attr_mdl_ent_id_fkey(ent_log_nm)')
    .eq('area_id', areaId)
    .eq('fk_rel_id', relId)
    .eq('del_yn', 'N')
  if (error) throw error
  return (data as unknown as { attr_id: string; ent_id: string; pk_yn: string; std_term: { term_log_nm: string } | null; mdl_ent: { ent_log_nm: string } | null }[]).map((x) => ({
    attr_id: x.attr_id,
    ent_log_nm: x.mdl_ent?.ent_log_nm ?? '',
    term_log_nm: x.std_term?.term_log_nm ?? '',
    pk_yn: x.pk_yn,
  }))
}

export async function GET(_req: Request, { params }: Ctx) {
  const { areaId, relId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  if (!z.string().uuid().safeParse(relId).success) return apiError('INVALID_INPUT', 400)
  try {
    return NextResponse.json({ ok: true, fk_attrs: await fkAttrs(areaId, relId) })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export const PATCH = relCrud.update

export async function DELETE(req: Request, ctx: Ctx) {
  const { areaId, relId } = await ctx.params
  const mode = new URL(req.url).searchParams.get('fk') === 'del' ? 'del' : 'keep'
  const auth = await requireAreaRole(areaId, 'REQUEST') // 권한 먼저(관계 삭제 뒤 권한 오류로 응답이 어긋나지 않게)
  if (auth instanceof NextResponse) return auth
  const res = await relCrud.remove(req, ctx)
  if (res.status !== 200) return res
  const uid = auth.user.usr_id
  const set = mode === 'del' ? { del_yn: 'Y', del_dtm: new Date().toISOString(), modr_id: uid } : { fk_rel_id: null, src_attr_id: null, modr_id: uid }
  const { data, error } = await db().from('mdl_attr').update(set).eq('area_id', areaId).eq('fk_rel_id', relId).eq('del_yn', 'N').select('attr_id, ent_id, term_id, pk_yn')
  if (error) {
    // 관계는 이미 삭제됨 — 상속 속성은 남아 있으므로 사용자에게 경고(논리 모델 FK 점검에서 다시 드러남)
    console.error('[relations/delete] 상속 속성 처리 실패', relId, error.message)
    return NextResponse.json({ ok: true, partial: true, fk_mode: mode, fk_attrs: null, message: '관계는 삭제했지만 상속 속성 처리에 실패했습니다 — 속성 패널에서 확인하십시오' })
  }
  for (const a of data) await audit({ area_id: areaId, tgt_tp_cd: 'ATTR', tgt_id: a.attr_id as string, act_cd: mode === 'del' ? 'DEL' : 'UPD', aftr_val: { ...a, ...set, rel_id: relId, fk_mode: mode }, usr_id: uid })
  return NextResponse.json({ ok: true, fk_mode: mode, fk_attrs: data.length })
}
