// 분류체계 설정 — GET 조회(조회자 이상), PATCH 수정(분류체계 관리자) : 이름·설명·용어 물리명 구분자·사용여부 6종
//  구분자는 활성 용어가 있으면 변경 불가(기존 물리 용어명과 불일치 방지)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { apiError, audit, dbError, parseBody, requireAreaRole } from '@/lib/api'

type Ctx = { params: Promise<{ areaId: string }> }
const COLS = 'area_id, area_nm, area_desc, term_sep_txt, word_use_yn, term_use_yn, dom_use_yn, combi_use_yn, cd_use_yn, cd_dom_map_yn'

export async function GET(_req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  const { data, error } = await db().from('std_area').select(COLS).eq('area_id', areaId).eq('del_yn', 'N').single()
  if (error) return dbError(error)
  return NextResponse.json({ ok: true, role: auth.role, perms: auth.perms, area: data })
}

const yn = z.enum(['Y', 'N'])
const schema = z
  .object({
    area_nm: z.string().trim().min(1).max(200),
    area_desc: z.string().trim().max(4000).nullable(),
    // 빈 값 = 구분자 없이 결합, '_' 기본(D10), '-' 허용
    term_sep_txt: z.string().regex(/^[_-]?$/),
    word_use_yn: yn,
    term_use_yn: yn,
    dom_use_yn: yn,
    combi_use_yn: yn,
    cd_use_yn: yn,
    cd_dom_map_yn: yn,
  })
  .partial()
  .strict()

export async function PATCH(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'SETTINGS')
  if (auth instanceof NextResponse) return auth
  const body = await parseBody(req, schema)
  if (body instanceof NextResponse) return body
  const cur = await db().from('std_area').select(COLS).eq('area_id', areaId).eq('del_yn', 'N').single()
  if (cur.error) return dbError(cur.error)
  const before = cur.data as Record<string, unknown>
  const set = Object.fromEntries(Object.entries(body).filter(([k, v]) => (v ?? null) !== (before[k] ?? null)))
  if (!Object.keys(set).length) return apiError('NO_CHANGE', 400)

  if ('term_sep_txt' in set) {
    const t = await db().from('std_term').select('term_id').eq('area_id', areaId).eq('del_yn', 'N').limit(1)
    if (t.error) return dbError(t.error)
    if (t.data.length) return apiError('SEP_LOCKED', 409)
  }
  const uid = auth.user.usr_id
  const { data, error } = await db().from('std_area').update({ ...set, modr_id: uid }).eq('area_id', areaId).select(COLS).single()
  if (error) return dbError(error, 'AREA_DUP_NM')
  await audit({ area_id: areaId, tgt_tp_cd: 'AREA', tgt_id: areaId, act_cd: 'UPD', bfr_val: before, aftr_val: data, usr_id: uid })
  return NextResponse.json({ ok: true, area: data })
}
