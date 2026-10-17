// 논리 엔터티 추천 — GET ?subj=&ai=1 : 선택 주제영역에 더할 엔터티명·유형·간단 설명 + 표준단어 분해·물리명 미리보기·이름 규칙. 저장하지 않음(등록 폼만 채움)
// 출처 : AI(ai=1, 신청 권한 이상 — 외부 호출 비용을 조회자에게 열지 않음, 키 없거나 실패 시 생략) → 업종 템플릿 → 규칙 파생(이력·상세). 프로젝트에 있는 이름 제외
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { apiError, dbError, requireAreaRole } from '@/lib/api'
import { areaDict } from '@/lib/term'
import type { EntWord } from '@/lib/model-name'
import { TEMPLATES, isIndstry } from '@/lib/modelpi/template'
import { recommendLogical } from '@/lib/modelpi/logical-ent'
import { suggestLogicalAi } from '@/lib/modelpi/entity-ai'

type Ctx = { params: Promise<{ areaId: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const sp = new URL(req.url).searchParams
  const subjId = sp.get('subj') ?? ''
  const useAi = sp.get('ai') === '1'
  const auth = await requireAreaRole(areaId, useAi ? 'REQUEST' : 'VIEW')
  if (auth instanceof NextResponse) return auth
  if (!z.string().uuid().safeParse(subjId).success) return apiError('INVALID_INPUT', 400)
  try {
    const s = await db()
      .from('mdl_subj')
      .select('subj_id, prj_id, subj_nm, subj_abbr_nm, subj_desc, mdl_prj!mdl_subj_mdl_prj_id_fkey(indstry_cd, tbl_pfx_txt, trgt_dbms_cd)')
      .eq('subj_id', subjId)
      .eq('area_id', areaId)
      .eq('del_yn', 'N')
      .maybeSingle<{ subj_id: string; prj_id: string; subj_nm: string; subj_abbr_nm: string; subj_desc: string | null; mdl_prj: { indstry_cd: string | null; tbl_pfx_txt: string; trgt_dbms_cd: string } | null }>()
    if (s.error) throw s.error
    if (!s.data) return apiError('NOT_FOUND', 404)
    const p = s.data.mdl_prj
    const tmpl = isIndstry(p?.indstry_cd) ? TEMPLATES[p.indstry_cd] : null
    const [dict, e] = await Promise.all([
      areaDict<EntWord>(areaId, 'dic_id, dic_log_nm, dic_phy_nm, attr_clss_yn, ent_clss_yn, forbid_yn, tbl_sfx_txt'),
      db().from('mdl_ent').select('subj_id, ent_log_nm, ent_tp_cd, ent_desc').eq('prj_id', s.data.prj_id).eq('del_yn', 'N'),
    ])
    if (e.error) throw e.error
    const rows = e.data as { subj_id: string; ent_log_nm: string; ent_tp_cd: string; ent_desc: string | null }[]
    const subjEnts = rows.filter((x) => x.subj_id === subjId)
    const ai = useAi ? await suggestLogicalAi(tmpl, { nm: s.data.subj_nm, desc: s.data.subj_desc }, subjEnts) : []
    const items = recommendLogical({ tmpl, subjNm: s.data.subj_nm, subjAbbr: s.data.subj_abbr_nm, subjEnts, have: new Set(rows.map((x) => x.ent_log_nm)), dict, ai, pfx: p?.tbl_pfx_txt, dbms: p?.trgt_dbms_cd })
    const src = [...(ai.length ? ['AI'] : []), ...(tmpl ? [`업종 템플릿 : ${tmpl.nm}`] : []), '규칙(이력·상세)']
    return NextResponse.json({ ok: true, items, src, ai_used: ai.length > 0, ai_asked: useAi })
  } catch (err) {
    return dbError(err as { code?: string; message?: string })
  }
}
