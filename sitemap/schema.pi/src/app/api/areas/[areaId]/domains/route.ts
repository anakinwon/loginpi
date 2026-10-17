// 표준도메인 API — GET 목록(검색명 q : 대표도메인명·도메인명, page·size 페이징), POST 등록(도메인명은 서버가 자동생성, 관리자 = 즉시 확정 / 편집자 = 승인 요청)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { pendingChg, reqOpt, requestIns, stsFilter, withActors } from '@/lib/approval'
import { ERR_STATUS } from '@/lib/change'
import { pageRows } from '@/lib/paging'
import { apiError, audit, dbError, parseBody, requireAreaRole } from '@/lib/api'
import { buildDomName, domKeyWordError, domainSchema } from '@/lib/domain'
import { domGrpValid } from '@/lib/settings'

type Ctx = { params: Promise<{ areaId: string }> }
const COLS =
  'dom_id, key_dom_nm, dom_nm, dom_tp_cd, dom_grp_id, lgc_tp_cd, data_len, data_scale, min_val_txt, max_val_txt, fmt_txt, unit_nm, alw_val_txt, disp_fmt_txt, dom_desc, std_se_cd, std_sts_cd, ver_no, std_lgc_tp(lgc_tp_nm, lgc_tp_abbr_nm), std_dom_grp(dom_grp_nm), regr_id, std_reg_dtm'

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const q = sp.get('q')?.trim()
  const sts = sp.get('sts')
  const se = sp.get('se')
  const pd = await pendingChg(areaId, 'DOM')
  if ('error' in pd) return dbError(pd.error)
  const build = () => {
    let query = db().from('std_dom').select(COLS, { count: 'exact' }).eq('area_id', areaId).eq('del_yn', 'N').order('std_reg_dtm', { ascending: false }).order('dom_nm')
    if (q) {
      const p = `%${q.replace(/[%_,()]/g, '')}%`
      query = query.or(`key_dom_nm.ilike.${p},dom_nm.ilike.${p}`)
    }
    // 상태 필터(REQ·CNFM·RJCT·DSCD, 그 외 값은 무시)
    query = stsFilter(query, sts, 'dom_id', pd.pend)
    // 표준구분 조건(STD·NSTD, 그 외 값은 무시)
    if (se === 'STD' || se === 'NSTD') query = query.eq('std_se_cd', se)
    return query
  }
  const r = await pageRows(build, sp, 1000)
  if (r.error) return dbError(r.error)
  let rows
  try {
    rows = await withActors(areaId, 'DOM', 'dom_id', r.rows as Record<string, unknown>[])
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
  return NextResponse.json({ ok: true, domains: rows.map((x) => ({ ...x, pend_act: pd.pend.get(x.dom_id as string) ?? null })), total: r.total, page: r.page, size: r.size })
}

export async function POST(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'REQUEST')
  if (auth instanceof NextResponse) return auth
  const opt = await reqOpt(req)
  const body = await parseBody(req, domainSchema)
  if (body instanceof NextResponse) return body
  const { user, role } = auth

  let dom_nm: string | null
  try {
    if (!(await domGrpValid(areaId, body.dom_grp_id))) return apiError('NOT_FOUND', 404)
    const keyErr = await domKeyWordError(areaId, body.key_dom_nm)
    if (keyErr) return apiError(keyErr, 400)
    dom_nm = await buildDomName(body)
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
  if (!dom_nm) return apiError('INVALID_INPUT', 400)

  const dup = await db().from('std_dom').select('dom_id').eq('area_id', areaId).eq('dom_nm', dom_nm).eq('del_yn', 'N').limit(1)
  if (dup.error) return dbError(dup.error)
  if (dup.data.length) return apiError('DOM_DUP_NM', 409)

  const row = { ...body, dom_nm }
  // 모든 등록은 승인 신청(승인대기) : DA가 즉시 승인을 고를 때만 승인완료
  const res = await requestIns('DOM', areaId, row, user, role, { self_apv: opt.self_apv, reason: opt.req_rsn })
  if (typeof res === 'string') return apiError(res, ERR_STATUS(res))
  const { data: dom, error } = await db().from('std_dom').select(COLS).eq('dom_id', res.tgt_id).single()
  if (error) return dbError(error)
  return NextResponse.json({ ok: true, domain: dom, requested: res.status === 'REQ', apv_req_id: res.apv_req_id }, { status: res.status === 'REQ' ? 202 : 201 })
}
