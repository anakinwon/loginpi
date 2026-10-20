// 표준도메인 엑셀 내려받기 — GET ?q= : 조회자 이상, 검색 조건에 맞는 전체 도메인을 CSV(UTF-8 BOM, 엑셀에서 열림)로 반환
// 헤더는 일괄등록 양식(행안부 공통표준)과 같아 내려받은 파일을 그대로 다시 올릴 수 있다(Wordict 출력 파일 = 일괄등록 템플릿, reqst.md)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { dbError, likeQ, requireAreaRole } from '@/lib/api'
import { HEADERS, toCsv, kstDtm } from '@/lib/bulk'
import { fetchAll } from '@/lib/bulk-check'
const SE_NM: Record<string, string> = { STD: '표준', NSTD: '비표준' } // 표준구분코드(sql/033)

type Ctx = { params: Promise<{ areaId: string }> }
interface Row {
  std_se_cd: string
  std_reg_dtm: string
  key_dom_nm: string
  dom_nm: string
  dom_desc: string | null
  data_len: number | null
  data_scale: number | null
  fmt_txt: string | null
  disp_fmt_txt: string | null
  unit_nm: string | null
  alw_val_txt: string | null
  std_lgc_tp: { lgc_tp_nm: string } | null
  std_dom_grp: { dom_grp_nm: string } | null
}

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'STD_VIEW')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const q = sp.get('q')?.trim()
  const se = sp.get('se') // 표준구분 조건(STD·NSTD, 그 외 값은 무시)
  try {
    const doms = await fetchAll<Row>(() => {
      let query = db()
        .from('std_dom')
        .select('key_dom_nm, dom_nm, dom_desc, data_len, data_scale, fmt_txt, disp_fmt_txt, unit_nm, alw_val_txt, std_lgc_tp(lgc_tp_nm), std_dom_grp(dom_grp_nm), std_se_cd, std_reg_dtm, dom_id')
        .eq('area_id', areaId)
        .eq('del_yn', 'N')
        .order('std_reg_dtm', { ascending: false })
        .order('dom_id') // 같은 등록일시 1,000건 묶음 경계에서 누락·중복 방지
      if (q) {
        const p = likeQ(q)
        query = query.or(`key_dom_nm.ilike.${p},dom_nm.ilike.${p}`)
      }
      if (se === 'STD' || se === 'NSTD') query = query.eq('std_se_cd', se)
      return query
    })
    const H = HEADERS.domains
    const csv = toCsv([
      [H.grp_nm, H.key_nm, H.dom_nm, H.desc, H.tp_nm, H.len, H.scale, H.stor_fmt, H.disp_fmt, H.unit, H.alw, '표준구분', '등록일시'],
      ...doms.map((d) => [
        d.std_dom_grp?.dom_grp_nm,
        d.key_dom_nm,
        d.dom_nm,
        d.dom_desc,
        d.std_lgc_tp?.lgc_tp_nm,
        d.data_len,
        d.data_scale,
        d.fmt_txt,
        d.disp_fmt_txt,
        d.unit_nm,
        d.alw_val_txt,
        SE_NM[d.std_se_cd] ?? d.std_se_cd,
        kstDtm(d.std_reg_dtm),
      ]),
    ])
    const name = encodeURIComponent(`표준도메인_${new Date().toISOString().slice(0, 10)}.csv`)
    return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename*=UTF-8''${name}` } })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
