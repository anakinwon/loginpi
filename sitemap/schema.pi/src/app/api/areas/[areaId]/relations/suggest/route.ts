// 관계 추천 — GET ?prj= : 프로젝트 업종 템플릿 관계 중 부모·자식 엔터티가 모두 등록된 것(기존 관계 제외). 반자동 : 저장 안 함(사용자가 골라 POST /relations)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { dbError, requireAreaRole } from '@/lib/api'
import { TEMPLATES, isIndstry } from '@/lib/modelpi/template'
import { recommendRelations } from '@/lib/modelpi/concept'

type Ctx = { params: Promise<{ areaId: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'MODEL_VIEW')
  if (auth instanceof NextResponse) return auth
  const prj = new URL(req.url).searchParams.get('prj') ?? ''
  if (!z.string().uuid().safeParse(prj).success) return NextResponse.json({ ok: true, rels: [] })
  const p = await db().from('mdl_prj').select('indstry_cd').eq('prj_id', prj).eq('area_id', areaId).eq('del_yn', 'N').maybeSingle()
  if (p.error) return dbError(p.error)
  if (!isIndstry(p.data?.indstry_cd)) return NextResponse.json({ ok: true, rels: [] })
  const [e, r] = await Promise.all([
    db().from('mdl_ent').select('ent_id, ent_log_nm').eq('prj_id', prj).eq('del_yn', 'N').limit(1000),
    db().from('mdl_rel').select('prnt_ent_id, chld_ent_id, rel_nm').eq('prj_id', prj).eq('del_yn', 'N').limit(5000),
  ])
  if (e.error) return dbError(e.error)
  if (r.error) return dbError(r.error)
  return NextResponse.json({ ok: true, rels: recommendRelations(TEMPLATES[p.data.indstry_cd], e.data, r.data), src: [`업종 템플릿 : ${TEMPLATES[p.data.indstry_cd].nm}`] })
}
