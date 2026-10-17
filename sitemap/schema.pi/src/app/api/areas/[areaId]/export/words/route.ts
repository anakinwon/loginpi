// 표준단어 엑셀 내려받기 — GET ?q= : 조회자 이상, 검색 조건에 맞는 전체 단어를 CSV(UTF-8 BOM, 엑셀에서 열림)로 반환
// 헤더는 일괄등록 양식(행안부 공통표준)과 같아 내려받은 파일을 그대로 다시 올릴 수 있다(Wordict 출력 파일 = 일괄등록 템플릿, reqst.md)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { dbError, requireAreaRole } from '@/lib/api'
import { HEADERS, toCsv, kstDtm } from '@/lib/bulk'
import { fetchAll } from '@/lib/bulk-check'

type Ctx = { params: Promise<{ areaId: string }> }
interface Row {
  dic_id: string
  dic_log_nm: string
  dic_phy_nm: string
  dic_eng_nm: string | null
  dic_chn_nm: string | null
  dic_desc: string | null
  ent_clss_yn: string
  attr_clss_yn: string
  forbid_yn: string
  key_dom_yn: string
  tbl_sfx_txt: string | null
  std_se_cd: string
  std_reg_dtm: string
}
const SE_NM: Record<string, string> = { STD: '표준', NSTD: '비표준' } // 표준구분코드(sql/033)

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const q = sp.get('q')?.trim()
  const se = sp.get('se') // 표준구분 조건(STD·NSTD, 그 외 값은 무시)
  try {
    const words = await fetchAll<Row>(() => {
      let query = db()
        .from('std_dic')
        .select('dic_id, dic_log_nm, dic_phy_nm, dic_eng_nm, dic_chn_nm, dic_desc, ent_clss_yn, attr_clss_yn, forbid_yn, key_dom_yn, tbl_sfx_txt, std_se_cd, std_reg_dtm')
        .eq('area_id', areaId)
        .eq('del_yn', 'N')
        .order('std_reg_dtm', { ascending: false })
        .order('dic_id') // 같은 등록일시 1,000건 묶음 경계에서 누락·중복 방지
      if (q) {
        const p = `%${q.replace(/[%_,()]/g, '')}%`
        query = query.or(`dic_log_nm.ilike.${p},dic_phy_nm.ilike.${p}`)
      }
      if (se === 'STD' || se === 'NSTD') query = query.eq('std_se_cd', se)
      return query
    })
    const rels = await fetchAll<{ dic_id: string; rel_tp_cd: string; rel_txt: string }>(() =>
      db().from('std_dic_rel').select('dic_id, rel_tp_cd, rel_txt, std_dic!inner(area_id)').eq('std_dic.area_id', areaId).in('rel_tp_cd', ['SYN', 'BAN']).eq('del_yn', 'N').order('rel_id'),
    )
    const syn = new Map<string, string[]>()
    const ban = new Map<string, string[]>()
    for (const r of rels) {
      const m = r.rel_tp_cd === 'BAN' ? ban : syn
      m.set(r.dic_id, [...(m.get(r.dic_id) ?? []), r.rel_txt])
    }
    const H = HEADERS.words
    const csv = toCsv([
      [H.log_nm, H.phy_nm, H.eng_nm, H.desc, H.fmt_word, H.syns, H.forbid, '엔터티분류어여부', '금칙어여부', H.key_dom, '테이블접미어', '표준구분', '등록일시'],
      ...words.map((w) => [
        w.dic_log_nm,
        w.dic_phy_nm,
        w.dic_eng_nm,
        // 한자는 일괄등록 규칙(설명 앞 '한자.')대로 설명 앞에 붙임
        w.dic_chn_nm ? `${w.dic_chn_nm}. ${w.dic_desc ?? ''}`.trim() : w.dic_desc,
        w.attr_clss_yn,
        syn.get(w.dic_id)?.join(', '),
        ban.get(w.dic_id)?.join(', '),
        w.ent_clss_yn,
        w.forbid_yn,
        w.key_dom_yn,
        w.tbl_sfx_txt,
        SE_NM[w.std_se_cd] ?? w.std_se_cd,
        kstDtm(w.std_reg_dtm),
      ]),
    ])
    const name = encodeURIComponent(`표준단어_${new Date().toISOString().slice(0, 10)}.csv`)
    return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename*=UTF-8''${name}` } })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
