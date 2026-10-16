// 도메인명 미리보기 — GET ?key=&lgc=&len=&scale= : 자동생성 도메인명과 분류체계 내 중복 여부
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiError, dbError, requireAreaRole } from '@/lib/api'
import { buildDomName } from '@/lib/domain'

type Ctx = { params: Promise<{ areaId: string }> }
const int = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : undefined)

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const key = sp.get('key')?.trim()
  const lgc = sp.get('lgc') ?? ''
  if (!key || !/^\d{4}$/.test(lgc)) return apiError('INVALID_INPUT', 400)
  try {
    const dom_nm = await buildDomName({ key_dom_nm: key, lgc_tp_cd: lgc, data_len: int(sp.get('len')), data_scale: int(sp.get('scale')) })
    if (!dom_nm) return apiError('INVALID_INPUT', 400)
    const { data, error } = await db().from('std_dom').select('dom_id').eq('area_id', areaId).eq('dom_nm', dom_nm).eq('del_yn', 'N').limit(1)
    if (error) throw error
    return NextResponse.json({ ok: true, dom_nm, dup: data.length > 0 })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
