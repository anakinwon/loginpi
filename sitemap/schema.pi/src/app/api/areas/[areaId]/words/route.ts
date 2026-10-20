// 표준단어 API — GET 목록(검색명 q : 논리명·물리명 부분 일치), POST 등록(분류체계 관리자 = 즉시 확정, 편집자 = 승인 요청)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { pendingChg, reqOpt, requestIns, stsFilter, withActors } from '@/lib/approval'
import { ERR_STATUS, wordNameError } from '@/lib/change'
import { pageRows } from '@/lib/paging'
import { apiError, audit, dbError, likeQ, parseBody, requireAreaRole } from '@/lib/api'

type Ctx = { params: Promise<{ areaId: string }> }
const COLS = 'dic_id, dic_log_nm, dic_phy_nm, dic_eng_nm, dic_chn_nm, ent_clss_yn, attr_clss_yn, forbid_yn, dic_desc, key_dom_yn, tbl_sfx_txt, std_se_cd, std_sts_cd, ver_no, mod_dtm, regr_id, std_reg_dtm'

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'STD_VIEW')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const q = sp.get('q')?.trim()
  const sts = sp.get('sts')
  const se = sp.get('se')
  const pd = await pendingChg(areaId, 'DIC')
  if ('error' in pd) return dbError(pd.error)
  const build = () => {
    let query = db().from('std_dic').select(COLS, { count: 'exact' }).eq('area_id', areaId).eq('del_yn', 'N').order('std_reg_dtm', { ascending: false }).order('dic_log_nm')
    if (q) {
      const p = likeQ(q)
      query = query.or(`dic_log_nm.ilike.${p},dic_phy_nm.ilike.${p}`)
    }
    // 상태 필터(REQ·CNFM·RJCT·DSCD, 그 외 값은 무시)
    query = stsFilter(query, sts, 'dic_id', pd.pend)
    // 표준구분 조건(STD·NSTD, 그 외 값은 무시)
    if (se === 'STD' || se === 'NSTD') query = query.eq('std_se_cd', se)
    // 속성 분류어만(도메인 대표도메인명 선택지)
    if (sp.get('attr') === 'Y') query = query.eq('attr_clss_yn', 'Y').eq('std_sts_cd', 'CNFM')
    // 지정된 대표도메인만(도메인 등록 대표도메인명 선택지, sql/013)
    if (sp.get('key') === 'Y') query = query.eq('key_dom_yn', 'Y').eq('attr_clss_yn', 'Y').eq('std_sts_cd', 'CNFM')
    return query
  }
  const r = await pageRows(build, sp, 1000)
  if (r.error) return dbError(r.error)
  let rows
  try {
    // 선택지 조회(속성 분류어·지정 대표도메인)는 등록자·승인자가 필요 없음 — 건너뜀
    rows = sp.get('attr') === 'Y' || sp.get('key') === 'Y' ? (r.rows as Record<string, unknown>[]) : await withActors(areaId, 'DIC', 'dic_id', r.rows as Record<string, unknown>[])
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
  return NextResponse.json({ ok: true, words: rows.map((x) => ({ ...x, pend_act: pd.pend.get(x.dic_id as string) ?? null })), total: r.total, page: r.page, size: r.size })
}

const yn = z.enum(['Y', 'N']).default('N')
const wordSchema = z.object({
  dic_log_nm: z.string().trim().min(1).max(200),
  // 물리명 : 영문으로 시작하는 영문·숫자 약어, 대문자로 저장(DA# 관례)
  dic_phy_nm: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9]*$/).max(200).transform((s) => s.toUpperCase()),
  dic_eng_nm: z.string().trim().max(500).optional(),
  dic_chn_nm: z.string().trim().max(200).optional(),
  ent_clss_yn: yn,
  attr_clss_yn: yn,
  forbid_yn: yn,
  dic_desc: z.string().trim().max(4000).optional(),
  std_se_cd: z.enum(['STD', 'NSTD']).optional(), // 표준구분코드(sql/033), 없으면 STD
})

export async function POST(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'STD_REQ')
  if (auth instanceof NextResponse) return auth
  const opt = await reqOpt(req)
  const body = await parseBody(req, wordSchema)
  if (body instanceof NextResponse) return body
  const { user, perms } = auth

  // 동음이의어(논리명)·이음동의어(물리명·기존 단어의 이음동의어 표기)는 저장 전에 차단, 최종 보장은 DB 유일 인덱스(sql/002·014)
  try {
    const nmErr = await wordNameError(areaId, body.dic_log_nm, body.dic_phy_nm)
    if (nmErr) return apiError(nmErr, 409)
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }

  // 모든 등록은 승인 신청(승인대기) : DA가 즉시 승인을 고를 때만 승인완료
  const res = await requestIns('DIC', areaId, body, user, perms, { self_apv: opt.self_apv, reason: opt.req_rsn })
  if (typeof res === 'string') return apiError(res, ERR_STATUS(res))
  const { data: word, error } = await db().from('std_dic').select(COLS).eq('dic_id', res.tgt_id).single()
  if (error) return dbError(error)
  return NextResponse.json({ ok: true, word, requested: res.status === 'REQ', apv_req_id: res.apv_req_id }, { status: res.status === 'REQ' ? 202 : 201 })
}
