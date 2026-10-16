// 엔터티 관계 — GET ?prj=&ent=&page=&size= 목록(조회 권한, 부모·자식 엔터티명·IE 표기·등록자 포함), POST { prnt_ent_id, chld_ent_id, crdn_cd?, idnt_yn?, prnt_opt_yn?, chld_opt_yn?, rel_nm?, rel_desc? } 등록(신청 권한)
// 규칙 src/lib/model-rel.ts, 저장 = mdl_rel(sql/021), 감사 이력 기록
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { dbError, requireAreaRole } from '@/lib/api'
import { pageRows } from '@/lib/paging'
import { withActors } from '@/lib/approval'
import { REL_COLS, relCrud } from '@/lib/model'
import { relNotation, type RelRule } from '@/lib/model-rel'

type Ctx = { params: Promise<{ areaId: string }> }
const COLS = `${REL_COLS}, prnt:mdl_ent!mdl_rel_prnt_ent_id_fkey(ent_log_nm), chld:mdl_ent!mdl_rel_chld_ent_id_fkey(ent_log_nm)`
const uuid = (v: string | null) => (v && z.string().uuid().safeParse(v).success ? v : null)

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const prj = uuid(sp.get('prj'))
  const ent = uuid(sp.get('ent'))
  const build = () => {
    let q = db().from('mdl_rel').select(COLS, { count: 'exact' }).eq('area_id', areaId).eq('del_yn', 'N').order('reg_dtm', { ascending: false })
    if (prj) q = q.eq('prj_id', prj)
    if (ent) q = q.or(`prnt_ent_id.eq.${ent},chld_ent_id.eq.${ent}`)
    return q
  }
  const r = await pageRows(build, sp, 1000)
  if (r.error) return dbError(r.error)
  try {
    const rows = (r.rows as unknown as (RelRule & { chld_opt_yn: string })[]).map((x) => ({ ...x, notation: relNotation(x) }))
    const items = await withActors(areaId, 'DIC', 'rel_id', rows as unknown as Record<string, unknown>[])
    return NextResponse.json({ ok: true, items, total: r.total, page: r.page, size: r.size })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export const POST = relCrud.create
