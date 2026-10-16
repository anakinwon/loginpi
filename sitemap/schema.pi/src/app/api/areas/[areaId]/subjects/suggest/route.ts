// 주제영역 자동 채움 후보 — GET ?nm= : 약어 3자(+대안)·설명·영문명·핵심 엔터티 후보(표준단어 분해·물리 테이블명) + 출처. 저장하지 않음(화면 폼에만 채움)
// 근거 순서 : ① 이 분류체계 표준단어 ② 다른 분류체계 승인완료 표준단어 ③ 위키백과 한국어판. 약어 규칙 subjAbbrCands, 이미 쓰는 약어 제외(sql/018 유일)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { dbError, requireAreaRole } from '@/lib/api'
import { areaDict } from '@/lib/term'
import { splitTerm } from '@/lib/term-split'
import { entNameError, entNames, subjAbbrCands, type EntWord } from '@/lib/model-name'
import { engTitle, pickStd, wikiDesc } from '@/lib/word-suggest'
import { wiki } from '@/lib/wiki'

type Ctx = { params: Promise<{ areaId: string }> }
const ENT_PATTERNS = ['', '상세', '이력', '상태이력'] // 주제영역 단어 + 엔터티 분류어 기본 조합
const ENT_MAX = 8

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const nm = sp.get('nm')?.trim() ?? ''
  const prj = sp.get('prj') ?? '' // 약어 중복·엔터티 중복 범위(sql/019), 없으면 분류체계 전체
  const subjAbbr = sp.get('abbr')?.trim().toUpperCase() ?? '' // 선택 주제영역 약어(엔터티 추천 물리명)
  if (!nm || nm.length > 100) return NextResponse.json({ ok: true, fill: {}, abbr_alts: [], ents: [], src: [] })
  try {
    const src: string[] = []
    let eng = ''
    let desc = ''
    // ① 이 분류체계 ② 다른 분류체계 표준단어
    const mine = await db().from('std_dic').select('dic_eng_nm, dic_desc').eq('area_id', areaId).eq('dic_log_nm', nm).eq('del_yn', 'N').eq('std_sts_cd', 'CNFM').maybeSingle()
    if (mine.error) throw mine.error
    if (mine.data?.dic_eng_nm) {
      eng = mine.data.dic_eng_nm
      desc = mine.data.dic_desc ?? ''
      src.push('표준단어(이 분류체계)')
    } else {
      const o = await db().from('std_dic').select('dic_phy_nm, dic_eng_nm, dic_desc, std_area!inner(area_nm, del_yn)').eq('dic_log_nm', nm).neq('area_id', areaId).eq('del_yn', 'N').eq('std_sts_cd', 'CNFM').eq('std_area.del_yn', 'N').limit(20)
      if (o.error) throw o.error
      const std = pickStd(o.data as unknown as { dic_phy_nm: string; dic_eng_nm: string | null; dic_desc: string | null; std_area: { area_nm: string } }[])
      if (std?.dic_eng_nm) {
        eng = std.dic_eng_nm
        desc = std.dic_desc ?? ''
        src.push(`표준단어 : ${std.std_area.area_nm}`)
      }
    }
    // ③ 위키백과(영문명·설명이 비었을 때만)
    if (!eng || !desc) {
      const w = await wiki(nm)
      if (w) {
        if (!eng && w.en) eng = engTitle(w.en)
        if (!desc) desc = wikiDesc(w.extract).desc
        src.push(`위키백과 '${w.title}'`)
      }
    }
    // 약어 3자 : 이미 쓰는 약어 제외
    let uq = db().from('mdl_subj').select('subj_abbr_nm').eq('area_id', areaId).eq('del_yn', 'N')
    if (/^[0-9a-f-]{36}$/i.test(prj)) uq = uq.eq('prj_id', prj)
    const used = await uq
    if (used.error) throw used.error
    const taken = new Set(used.data.map((x) => x.subj_abbr_nm as string))
    const abbrs = subjAbbrCands(eng).filter((a) => !taken.has(a))
    const abbr = abbrs[0] ?? ''
    if (abbr) src.push(`약어 : ${eng} → ${abbr}`)
    // 핵심 엔터티 후보 : 기본 조합 + 주제영역명으로 시작하는 복합어(사전 순), 승인완료 단어로만 분해되고 이름 규칙·중복 통과한 것
    const dict = await areaDict<EntWord>(areaId, 'dic_id, dic_log_nm, dic_phy_nm, attr_clss_yn, ent_clss_yn, forbid_yn, tbl_sfx_txt')
    const compound = dict
      .filter((w) => w.dic_log_nm.startsWith(nm) && w.dic_log_nm !== nm && w.attr_clss_yn !== 'Y')
      .map((w) => w.dic_log_nm)
      .sort((a, b) => a.length - b.length)
    const names = [...new Set([...ENT_PATTERNS.map((p) => nm + p), ...compound])]
    let eq = db().from('mdl_ent').select('ent_log_nm').eq('area_id', areaId).eq('del_yn', 'N').in('ent_log_nm', names)
    if (/^[0-9a-f-]{36}$/i.test(prj)) eq = eq.eq('prj_id', prj)
    const ex = await eq
    if (ex.error) throw ex.error
    const have = new Set(ex.data.map((x) => x.ent_log_nm as string))
    const ents: { ent_log_nm: string; tbl_phy_nm: string; dic_ids: string[] }[] = []
    for (const n of names) {
      if (ents.length >= ENT_MAX) break
      const segs = splitTerm(n, dict)[0]
      const ws = segs?.flatMap((x) => ('word' in x ? [x.word as EntWord] : [])) ?? []
      if (!ws.length || ws.length !== segs.length || entNameError(ws, 'BASE')) continue
      const e = entNames(ws, (/^[A-Z]{3}$/.test(subjAbbr) ? subjAbbr : abbr) || '○○○')
      if (!have.has(e.ent_log_nm)) ents.push({ ent_log_nm: e.ent_log_nm, tbl_phy_nm: e.tbl_phy_nm, dic_ids: ws.map((w) => w.dic_id) })
    }
    const seg0 = splitTerm(nm, dict)[0]
    const isWord = !!seg0?.length && seg0.every((x) => 'word' in x) // 서버 등록 규칙(isStdName)과 같은 판정
    return NextResponse.json({ ok: true, fill: { subj_abbr_nm: abbr, subj_desc: desc, eng }, abbr_alts: abbrs.slice(1, 5), ents, is_word: isWord, src })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
