// 표준 점검(P17~P19) — GET : 분류체계의 승인완료 단어·도메인·용어 전수 검사 결과(준수율·규칙별 건수·위반 목록), ?format=csv 위반 목록 내려받기
// 실행 시점 계산(결과 저장 없음), 규칙·등급은 src/lib/std-check.ts(PRD §2.4). 조회 권한(VIEW)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { dbError, requireAreaRole } from '@/lib/api'
import { fetchAll } from '@/lib/bulk-check'
import { kstDtm, toCsv } from '@/lib/bulk'
import { areaSep } from '@/lib/term'
import { RULES, runCheck, type ChkDom, type ChkTerm, type ChkWord } from '@/lib/std-check'

type Ctx = { params: Promise<{ areaId: string }> }
const TP_NM = { DIC: '단어', DOM: '도메인', TERM: '용어' } as const

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'SET_VIEW')
  if (auth instanceof NextResponse) return auth
  try {
    const cnfm = (t: string, cols: string, pk: string) => () => db().from(t).select(cols).eq('area_id', areaId).eq('del_yn', 'N').eq('std_sts_cd', 'CNFM').order(pk)
    const [words, domRows, termRows, links, syns, sep] = await Promise.all([
      fetchAll<ChkWord>(cnfm('std_dic', 'dic_id, dic_log_nm, dic_phy_nm, dic_eng_nm, attr_clss_yn, forbid_yn, key_dom_yn, ent_clss_yn, tbl_sfx_txt', 'dic_id')),
      fetchAll<Omit<ChkDom, 'lgc_tp_abbr_nm'> & { std_lgc_tp: { lgc_tp_abbr_nm: string } | null }>(cnfm('std_dom', 'dom_id, dom_nm, key_dom_nm, data_len, data_scale, std_lgc_tp(lgc_tp_abbr_nm)', 'dom_id')),
      fetchAll<Omit<ChkTerm, 'dic_ids'>>(cnfm('std_term', 'term_id, term_log_nm, term_phy_nm, dom_id, nstd_yn', 'term_id')),
      fetchAll<{ term_id: string; dic_seq: number; dic_id: string }>(() =>
        db().from('std_term_dic').select('term_id, dic_seq, dic_id, std_term!inner(area_id, del_yn)').eq('std_term.area_id', areaId).eq('std_term.del_yn', 'N').order('term_id').order('dic_seq'),
      ),
      fetchAll<{ rel_txt: string }>(() =>
        db().from('std_dic_rel').select('rel_txt, rel_id, std_dic!inner(area_id, del_yn)').in('rel_tp_cd', ['SYN', 'BAN']).eq('del_yn', 'N').eq('std_dic.area_id', areaId).eq('std_dic.del_yn', 'N').order('rel_id'),
      ),
      areaSep(areaId),
    ])
    const ids = new Map<string, string[]>()
    for (const l of links) ids.set(l.term_id, [...(ids.get(l.term_id) ?? []), l.dic_id])
    const doms: ChkDom[] = domRows.map(({ std_lgc_tp, ...d }) => ({ ...d, lgc_tp_abbr_nm: std_lgc_tp?.lgc_tp_abbr_nm ?? null }))
    const terms: ChkTerm[] = termRows.map((t) => ({ ...t, dic_ids: ids.get(t.term_id) ?? [] }))
    const r = runCheck({ words, doms, terms, syns: syns.map((s) => s.rel_txt), sep })
    const at = new Date().toISOString()

    if (new URL(req.url).searchParams.get('format') === 'csv') {
      const rn = Object.fromEntries(RULES.map((x) => [x.id, x.nm]))
      const csv = toCsv([['등급', '규칙', '규칙명', '대상', '이름', '내용', '점검일시'], ...r.violations.map((v) => [v.grade, v.rule, rn[v.rule], TP_NM[v.tp], v.name, v.detail, kstDtm(at)])])
      const name = encodeURIComponent(`표준점검_${at.slice(0, 10)}.csv`)
      return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename*=UTF-8''${name}` } })
    }
    const byRule = RULES.map((x) => ({ ...x, cnt: r.violations.filter((v) => v.rule === x.id).length }))
    const byGrade = { P1: 0, P2: 0, P3: 0 }
    for (const v of r.violations) byGrade[v.grade]++
    return NextResponse.json({ ok: true, at, summary: r.summary, nstd: r.nstd, by_rule: byRule, by_grade: byGrade, violations: r.violations })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
