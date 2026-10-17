// 논리 모델 — GET : 프로젝트 엔터티·속성·관계 + 점검(FK 전파 누락·정규화 의심·엔터티별 검증·준수율) + Mermaid ERD 텍스트. 조회 권한, 저장 없음(반자동 : 적용은 속성 API)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, dbError, requireAreaRole } from '@/lib/api'
import { loadLogical } from '@/lib/model-logical'
import { checkLogical } from '@/lib/modelpi/normalize'
import { toMermaid } from '@/lib/modelpi/erd'

type Ctx = { params: Promise<{ areaId: string; prjId: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  if (!z.string().uuid().safeParse(prjId).success) return apiError('INVALID_INPUT', 400)
  try {
    const m = await loadLogical(areaId, prjId)
    if (!m) return apiError('NOT_FOUND', 404)
    const ents = m.ents.map(({ words, ...e }) => ({ ...e, words: words.map((w) => w.dic_log_nm) }))
    return NextResponse.json({ ok: true, prj: m.prj, ents, rels: m.rels, ...checkLogical(m.ents, m.rels), mermaid: toMermaid(m.ents, m.rels, (m.prj as { prj_nm: string }).prj_nm), capped: m.capped })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
