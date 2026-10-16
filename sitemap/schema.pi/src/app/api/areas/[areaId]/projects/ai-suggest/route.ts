// 프로젝트 AI 추천 — POST { indstry_cd, prj_nm?, prj_desc? } → { desc, names[], prefixes[], src }. prefixes = 스키마 접두사 후보(AI 후보 + 규칙, 이 분류체계 다른 프로젝트 사용분 제외, sql/023). dbms = 대상 DBMS 추천(업종 규칙, sql/024). 저장하지 않음(화면이 입력칸만 채움)
// 신청 권한(REQUEST) 이상만 : 프로젝트 등록 화면 사용자와 같고, 외부 AI 호출 비용을 조회자에게 열지 않는다
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dbError, parseBody, requireAreaRole } from '@/lib/api'
import { db } from '@/lib/db'
import { suggestProject } from '@/lib/modelpi/project-ai'
import { INDSTRY_CDS, tblPfxCands } from '@/lib/modelpi/template'
import { recommendDbms } from '@/lib/modelpi/dbms'

type Ctx = { params: Promise<{ areaId: string }> }

const schema = z.object({
  indstry_cd: z.enum(INDSTRY_CDS),
  prj_nm: z.string().trim().max(100).optional().default(''),
  prj_desc: z.string().trim().max(4000).optional().default(''),
})

export async function POST(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'REQUEST')
  if (auth instanceof NextResponse) return auth
  const body = await parseBody(req, schema)
  if (body instanceof NextResponse) return body
  const used = await db().from('mdl_prj').select('tbl_pfx_txt').eq('area_id', areaId).eq('del_yn', 'N')
  if (used.error) return dbError(used.error)
  const r = await suggestProject(body.indstry_cd, body.prj_nm, body.prj_desc)
  return NextResponse.json({ ok: true, ...r, prefixes: tblPfxCands(body.indstry_cd, used.data.map((x) => x.tbl_pfx_txt as string), r.prefixes), dbms: recommendDbms(body.indstry_cd) })
}
