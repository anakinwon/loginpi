// 표준단어 중복 검사 — GET ?log_nm=&phy_nm=&eng_nm= : 논리명 중복(동음이의어)·물리명 중복·기존 단어의 이음동의어 표기(이음동의어) = 등록 불가,
// 영문풀네임 중복 = 경고(지침서 3.3 : 영문 명이 같으면 약어를 달리 정의하면 허용)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { dbError, likeEsc, requireAreaRole } from '@/lib/api'
import { synOf } from '@/lib/change'

type Ctx = { params: Promise<{ areaId: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'STD_VIEW')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const log = sp.get('log_nm')?.trim()
  const phy = sp.get('phy_nm')?.trim().toUpperCase()
  const eng = sp.get('eng_nm')?.trim()
  const find = async (col: string, v?: string) => {
    if (!v) return []
    const { data, error } = await db().from('std_dic').select('dic_log_nm, dic_phy_nm').eq('area_id', areaId).eq(col, v).eq('del_yn', 'N').limit(5)
    if (error) throw error
    return data
  }
  try {
    const [logDup, phyDup, syn, engDup] = await Promise.all([
      find('dic_log_nm', log),
      find('dic_phy_nm', phy),
      log ? synOf(areaId, log) : null,
      eng ? db().from('std_dic').select('dic_log_nm, dic_phy_nm').eq('area_id', areaId).ilike('dic_eng_nm', likeEsc(eng)).eq('del_yn', 'N').limit(5) : null,
    ])
    if (engDup?.error) throw engDup.error
    return NextResponse.json({ ok: true, logical_dup: logDup.length > 0, physical_dup: phyDup, syn_of: syn, eng_dup: engDup?.data ?? [] })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
