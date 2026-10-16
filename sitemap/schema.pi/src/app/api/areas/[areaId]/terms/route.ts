// 표준용어 API — GET 목록(검색명 q), POST 등록 { dic_ids(순서), dom_id, term_desc } : 용어명은 서버가 단어 조합으로 생성(PRD M5), 관리자 = 즉시 확정 / 편집자 = 승인 요청
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { pendingChg, reqOpt, requestIns, stsFilter, withActors } from '@/lib/approval'
import { ERR_STATUS } from '@/lib/change'
import { pageRows } from '@/lib/paging'
import { apiError, audit, dbError, parseBody, requireAreaRole } from '@/lib/api'
import { areaSep, termDomError, termDup, termExtShape, wordsByIds } from '@/lib/term'
import { termNames, termRuleError } from '@/lib/term-split'

type Ctx = { params: Promise<{ areaId: string }> }
const COLS = 'term_id, term_log_nm, term_phy_nm, term_desc, nstd_yn, alw_val_txt, disp_fmt_txt, adm_cd_nm, own_org_nm, syn_txt, std_sts_cd, ver_no, std_dom(dom_id, dom_nm, key_dom_nm), regr_id, std_reg_dtm'

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const q = sp.get('q')?.trim()
  const sts = sp.get('sts')
  const pd = await pendingChg(areaId, 'TERM')
  if ('error' in pd) return dbError(pd.error)
  const build = () => {
    let query = db().from('std_term').select(COLS, { count: 'exact' }).eq('area_id', areaId).eq('del_yn', 'N').order('std_reg_dtm', { ascending: false }).order('term_log_nm')
    if (q) {
      const p = `%${q.replace(/[%_,()]/g, '')}%`
      query = query.or(`term_log_nm.ilike.${p},term_phy_nm.ilike.${p}`)
    }
    // 상태 필터(REQ·CNFM·RJCT·DSCD, 그 외 값은 무시)
    query = stsFilter(query, sts, 'term_id', pd.pend)
    return query
  }
  const r = await pageRows(build, sp, 500)
  if (r.error) return dbError(r.error)
  let rows
  try {
    rows = await withActors(areaId, 'TERM', 'term_id', r.rows as Record<string, unknown>[])
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
  return NextResponse.json({ ok: true, terms: rows.map((x) => ({ ...x, pend_act: pd.pend.get(x.term_id as string) ?? null })), total: r.total, page: r.page, size: r.size })
}

const termSchema = z.object({
  dic_ids: z.array(z.string().uuid()).min(1).max(20),
  dom_id: z.string().uuid(),
  term_desc: z.string().trim().max(4000).optional(),
  ...termExtShape,
})

export async function POST(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'REQUEST')
  if (auth instanceof NextResponse) return auth
  const opt = await reqOpt(req)
  const body = await parseBody(req, termSchema)
  if (body instanceof NextResponse) return body
  const { user, role } = auth

  try {
    const words = await wordsByIds(areaId, body.dic_ids)
    if (!words) return apiError('TERM_WORD_INVALID', 400)
    const rule = termRuleError(words)
    if (rule) return apiError(rule, 400)
    const domErr = await termDomError(areaId, body.dom_id, words[words.length - 1].dic_log_nm)
    if (domErr) return apiError(domErr, domErr === 'NOT_FOUND' ? 404 : 400)

    const names = termNames(words, await areaSep(areaId))
    const dup = await termDup(areaId, names.term_log_nm, names.term_phy_nm)
    if (dup.dup_log || dup.dup_phy) return apiError('TERM_DUP_NM', 409)

    // 모든 등록은 승인 신청(승인대기) : DA가 즉시 승인을 고를 때만 승인완료
    const res = await requestIns('TERM', areaId, { ...body, ...names }, user, role, { self_apv: opt.self_apv, reason: opt.req_rsn })
    if (typeof res === 'string') return apiError(res, ERR_STATUS(res))
    const { data: term, error } = await db().from('std_term').select(COLS).eq('term_id', res.tgt_id).single()
    if (error) return dbError(error)
    return NextResponse.json({ ok: true, term, requested: res.status === 'REQ', apv_req_id: res.apv_req_id }, { status: res.status === 'REQ' ? 202 : 201 })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
