// 주식별자·필수 속성 추천 — GET : { pk[], required[], warn[] }(반자동 : 저장하지 않음, 사용자가 골라 POST …/attributes)
// 규칙 src/lib/modelpi/logical.ts(분류어별 PK·식별 관계 상속·비식별 FK·실체 이름/코드·행위 일시/측정값·업종 템플릿), 입력 수집 src/lib/model-attr.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, dbError, requireAreaRole } from '@/lib/api'
import { attrSuggestInput, getEnt } from '@/lib/model-attr'
import { recommendAttrs } from '@/lib/modelpi/logical'

type Ctx = { params: Promise<{ areaId: string; entId: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { areaId, entId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  if (!z.string().uuid().safeParse(entId).success) return apiError('INVALID_INPUT', 400)
  try {
    const ent = await getEnt(areaId, entId)
    if (!ent) return apiError('NOT_FOUND', 404)
    return NextResponse.json({ ok: true, ...recommendAttrs(await attrSuggestInput(areaId, ent)) })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
