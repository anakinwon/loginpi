// 용어명 분석 — GET ?name= : 표준단어 분해 후보(최장 일치)별 구성 단어·미등록 구간·생성 용어명·중복·구성 규칙 결과
import { NextResponse } from 'next/server'
import { apiError, dbError, requireAreaRole } from '@/lib/api'
import { areaDict, areaSep, termDup } from '@/lib/term'
import { splitTerm, termNames, termRuleError, type DicWord } from '@/lib/term-split'

type Ctx = { params: Promise<{ areaId: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'STD_VIEW')
  if (auth instanceof NextResponse) return auth
  const name = new URL(req.url).searchParams.get('name')?.trim() ?? ''
  if (!name || name.length > 200) return apiError('INVALID_INPUT', 400)
  try {
    const [dict, sep] = await Promise.all([areaDict(areaId), areaSep(areaId)])
    const candidates = await Promise.all(
      splitTerm(name, dict).map(async (segs) => {
        const words = segs.flatMap((s) => ('word' in s ? [s.word] : []))
        const complete = words.length === segs.length
        if (!complete) return { segments: segs, complete }
        const names = termNames(words, sep)
        return { segments: segs, complete, ...names, ...(await termDup(areaId, names.term_log_nm, names.term_phy_nm)), rule_error: termRuleError(words as DicWord[]) }
      }),
    )
    return NextResponse.json({ ok: true, sep, candidates })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
