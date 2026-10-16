// 표준단어 자동 채움 후보 — GET ?log_nm= : 물리명·영문풀네임·한자·설명 후보 + 물리명 대안(phy_alts) + 출처(저장하지 않음, 화면 폼에만 채움)
// 물리명 : 다른 분류체계 약어가 관용형(머리글자·영문 단어 그대로·규칙 후보, 4자 이하 : VAT·ZIP)이면 우선, 그 밖(MDFCN·SOU)은 지침서 규칙(2자 → 3자 → 4자) 뒤 참고 후보. 이 분류체계에서 쓰는 약어는 제외(이음동의어 금지)
// 근거 : ① 다른 분류체계의 승인완료 표준단어 ② 위키백과 한국어판(요약·영어판 제목). 규칙은 src/lib/word-suggest.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { dbError, requireAreaRole } from '@/lib/api'
import { abbrCands, engTitle, pickStd, wikiDesc } from '@/lib/word-suggest'
import { wiki } from '@/lib/wiki'

type Ctx = { params: Promise<{ areaId: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'REQUEST')
  if (auth instanceof NextResponse) return auth
  const name = new URL(req.url).searchParams.get('log_nm')?.trim() ?? ''
  if (!name || name.length > 200) return NextResponse.json({ ok: true, fill: {}, src: [] })

  const fill: Record<string, string> = {}
  const src: string[] = []
  // ① 다른 분류체계 표준단어(같은 분류체계 중복은 화면 중복 검사가 담당)
  const { data, error } = await db()
    .from('std_dic')
    .select('dic_phy_nm, dic_eng_nm, dic_chn_nm, dic_desc, std_area!inner(area_nm, del_yn)')
    .eq('dic_log_nm', name)
    .neq('area_id', areaId)
    .eq('del_yn', 'N')
    .eq('std_sts_cd', 'CNFM')
    .eq('std_area.del_yn', 'N')
    .limit(20)
  if (error) return dbError(error)
  const std = pickStd(data as unknown as { dic_phy_nm: string; dic_eng_nm: string | null; dic_chn_nm: string | null; dic_desc: string | null; std_area: { area_nm: string } }[])
  if (std) {
    if (std.dic_eng_nm) fill.dic_eng_nm = std.dic_eng_nm
    if (std.dic_chn_nm) fill.dic_chn_nm = std.dic_chn_nm
    if (std.dic_desc) fill.dic_desc = std.dic_desc
    src.push(`표준단어 : ${std.std_area.area_nm}`)
  }
  // ② 위키백과 — 표준단어에 없는 칸만
  if (!fill.dic_eng_nm || !fill.dic_desc) {
    const w = await wiki(name)
    if (w) {
      const eng = w.en ? engTitle(w.en) : ''
      const { desc, chn } = wikiDesc(w.extract)
      const used: string[] = []
      if (!fill.dic_eng_nm && eng) (fill.dic_eng_nm = eng), used.push('영문풀네임')
      if (!fill.dic_chn_nm && chn) (fill.dic_chn_nm = chn), used.push('한자')
      if (!fill.dic_desc && desc) (fill.dic_desc = desc), used.push('설명')
      if (used.length) src.push(`위키백과 '${w.title}' : ${used.join('·')}`)
    }
  }
  // 물리명 후보 : 관용 공식 약어 → 지침서 규칙 → 그 밖의 공식 약어(참고), 이 분류체계 사용 중인 약어 제외
  const official = std?.dic_phy_nm
  const rule = abbrCands(fill.dic_eng_nm ?? '')
  const engWords = engTitle(fill.dic_eng_nm ?? '').toUpperCase().split(' ')
  const conv = !!official && official.length <= 4 && (rule.includes(official) || engWords.includes(official))
  const cands = [...new Set([...(conv ? [official] : []), ...rule, ...(official ? [official] : [])])]
  let phy_alts: string[] = []
  if (cands.length) {
    const t = await db().from('std_dic').select('dic_phy_nm').eq('area_id', areaId).eq('del_yn', 'N').in('dic_phy_nm', cands)
    if (t.error) return dbError(t.error)
    const taken = new Set(t.data.map((r) => r.dic_phy_nm))
    const free = cands.filter((c) => !taken.has(c))
    if (free.length) {
      fill.dic_phy_nm = free[0]
      phy_alts = free.slice(1, 5)
      src.push(free[0] === official ? `물리명 : ${std?.std_area.area_nm} 약어` : `물리명 : 표준단어 지침서 약어 규칙${taken.size ? `(사용 중 ${[...taken].join('·')} 제외)` : ''}`)
    } else src.push(`물리명 : 후보 ${cands.join('·')} 모두 사용 중(직접 입력)`)
  }
  return NextResponse.json({ ok: true, fill, phy_alts, src })
}
