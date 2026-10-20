// 코드기본 마스터코드명 표준 확인 — GET ?nm= : 승인완료 표준용어 이름이거나 표준단어(1개 또는 표준단어로만 분해)여야 사용 가능(마스터 지시 2026-10-20)
//  응답 { ok, std: 'TERM' | 'WORD' | null } — 코드명 용어(마스터코드명 + 구분코드|종류코드|유형코드) 존재 여부는 화면이 표준용어 조회로 따로 확인
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiError, dbError, requireAreaRole } from '@/lib/api'
import { isStdName } from '@/lib/model'

type Ctx = { params: Promise<{ areaId: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'STD_VIEW')
  if (auth instanceof NextResponse) return auth
  const nm = (new URL(req.url).searchParams.get('nm') ?? '').trim().replace(/\s+/g, '')
  if (!nm || nm.length > 200) return apiError('INVALID_INPUT', 400)
  try {
    const t = await db().from('std_term').select('term_id').eq('area_id', areaId).eq('term_log_nm', nm).eq('del_yn', 'N').eq('std_sts_cd', 'CNFM').limit(1)
    if (t.error) return dbError(t.error)
    if (t.data.length) return NextResponse.json({ ok: true, std: 'TERM' })
    return NextResponse.json({ ok: true, std: (await isStdName(areaId, nm)) ? 'WORD' : null })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
