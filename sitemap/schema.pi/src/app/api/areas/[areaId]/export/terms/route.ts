// 표준용어 엑셀 내려받기 GET ?q= : 조회자 이상, 검색 조건에 맞는 전체 용어를 CSV(UTF-8 BOM, 엑셀에서 열림)로 반환
// 헤더는 일괄등록 양식(행안부 공통표준)과 같고, 도메인명은 DA# 도메인명(std_dom.dom_nm)을 그대로 쓴다
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { dbError, requireAreaRole } from '@/lib/api'
import { HEADERS, toCsv, kstDtm } from '@/lib/bulk'
import { fetchAll } from '@/lib/bulk-check'
const SE_NM: Record<string, string> = { STD: '표준', NSTD: '비표준' } // 표준구분코드(sql/033)

type Ctx = { params: Promise<{ areaId: string }> }
interface Row {
  std_se_cd: string
  std_reg_dtm: string
  term_log_nm: string
  term_phy_nm: string
  term_desc: string | null
  alw_val_txt: string | null
  disp_fmt_txt: string | null
  adm_cd_nm: string | null
  own_org_nm: string | null
  syn_txt: string | null
  std_dom: { dom_nm: string } | null
}

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'STD_VIEW')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const q = sp.get('q')?.trim()
  const se = sp.get('se') // 표준구분 조건(STD·NSTD, 그 외 값은 무시)
  try {
    const terms = await fetchAll<Row>(() => {
      let query = db()
        .from('std_term')
        .select('term_log_nm, term_phy_nm, term_desc, alw_val_txt, disp_fmt_txt, adm_cd_nm, own_org_nm, syn_txt, std_dom(dom_nm), std_se_cd, std_reg_dtm, term_id')
        .eq('area_id', areaId)
        .eq('del_yn', 'N')
        .order('std_reg_dtm', { ascending: false })
        .order('term_id') // 같은 등록일시 1,000건 묶음 경계에서 누락·중복 방지
      if (q) {
        const p = `%${q.replace(/[%_,()]/g, '')}%`
        query = query.or(`term_log_nm.ilike.${p},term_phy_nm.ilike.${p}`)
      }
      if (se === 'STD' || se === 'NSTD') query = query.eq('std_se_cd', se)
      return query
    })
    const H = HEADERS.terms
    const csv = toCsv([
      [H.log_nm, H.desc, H.phy_nm, H.dom_nm, H.alw, H.disp_fmt, H.adm_cd, H.org, H.syns, '표준구분', '등록일시'],
      ...terms.map((t) => [t.term_log_nm, t.term_desc, t.term_phy_nm, t.std_dom?.dom_nm, t.alw_val_txt, t.disp_fmt_txt, t.adm_cd_nm, t.own_org_nm, t.syn_txt, SE_NM[t.std_se_cd] ?? t.std_se_cd, kstDtm(t.std_reg_dtm)]),
    ])
    const name = encodeURIComponent(`표준용어_${new Date().toISOString().slice(0, 10)}.csv`)
    return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename*=UTF-8''${name}` } })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
