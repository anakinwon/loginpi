// 엔터티명 분석 — GET ?name=&subj= : 승인완료 표준단어 분해 후보(최장 일치)별 구성 단어·미등록 구간·논리명·물리 테이블명 미리보기·이름 규칙·중복
// 용어 분석(terms/analyze)과 같은 분해(splitTerm)를 쓰되, 규칙은 엔터티 규칙(model-name.ts : 속성 분류어로 끝날 수 없음, 끝 엔터티 분류어 → 테이블 접미어)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { apiError, dbError, requireAreaRole } from '@/lib/api'
import { splitTerm } from '@/lib/term-split'
import { areaDict } from '@/lib/term'
import { entNameError, entNames, ENT_TP, type EntTp, type EntWord } from '@/lib/model-name'

type Ctx = { params: Promise<{ areaId: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const name = sp.get('name')?.trim() ?? ''
  const subj = sp.get('subj') ?? ''
  const tp = (Object.hasOwn(ENT_TP, sp.get('tp') ?? '') ? sp.get('tp') : 'BASE') as EntTp
  if (!name || name.length > 200) return apiError('INVALID_INPUT', 400)
  try {
    const [dict, s] = await Promise.all([
      areaDict<EntWord>(areaId, 'dic_id, dic_log_nm, dic_phy_nm, attr_clss_yn, ent_clss_yn, forbid_yn, tbl_sfx_txt'),
      z.string().uuid().safeParse(subj).success ? db().from('mdl_subj').select('subj_abbr_nm, prj_id, mdl_prj!mdl_subj_mdl_prj_id_fkey(tbl_pfx_txt)').eq('subj_id', subj).eq('area_id', areaId).eq('del_yn', 'N').maybeSingle() : Promise.resolve({ data: null, error: null }),
    ])
    if (s.error) throw s.error
    const abbr = (s.data as { subj_abbr_nm: string } | null)?.subj_abbr_nm ?? '○○○'
    const pfx = (s.data as { mdl_prj: { tbl_pfx_txt: string } | null } | null)?.mdl_prj?.tbl_pfx_txt // 프로젝트 스키마 접두사(sql/023)
    const prj = (s.data as { prj_id: string } | null)?.prj_id // 이름 유일 범위 = 프로젝트(sql/019), 주제영역 미선택이면 분류체계 전체
    const words = dict
    const candidates = await Promise.all(
      splitTerm(name, words).map(async (segs) => {
        const ws = segs.flatMap((x) => ('word' in x ? [x.word as EntWord] : []))
        const complete = ws.length === segs.length
        if (!complete) return { segments: segs, complete }
        const n = entNames(ws, abbr, pfx)
        let dq = db().from('mdl_ent').select('ent_id').eq('area_id', areaId).eq('ent_log_nm', n.ent_log_nm).eq('del_yn', 'N')
        if (prj) dq = dq.eq('prj_id', prj)
        const d = await dq.limit(1)
        if (d.error) throw d.error
        return { segments: segs, complete, ...n, dic_ids: ws.map((w) => w.dic_id), dup: d.data.length > 0, rule_error: entNameError(ws, tp) }
      }),
    )
    return NextResponse.json({ ok: true, candidates })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
