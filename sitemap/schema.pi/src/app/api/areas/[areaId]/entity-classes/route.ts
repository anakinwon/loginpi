// 엔터티 분류어 목록 — GET ?q=&sts=&page=&size= : 엔터티 분류어 단어(ent_clss_yn=Y) + 지정·해제·접미어 변경 신청 대기 단어, 등록자·승인자
// 지정·해제·접미어 변경은 단어 수정 신청(PATCH /words/[dicId] { ver_no, ent_clss_yn, tbl_sfx_txt })으로 처리(sql/017, 승인 절차 공용)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { dbError, likeQ, requireAreaRole } from '@/lib/api'
import { pageRows } from '@/lib/paging'
import { stsFilter, withActors } from '@/lib/approval'

type Ctx = { params: Promise<{ areaId: string }> }
const COLS = 'dic_id, dic_log_nm, dic_phy_nm, dic_desc, ent_clss_yn, tbl_sfx_txt, forbid_yn, std_sts_cd, ver_no, regr_id, std_reg_dtm'
type Pend = { req_id: string; ent: string | null; sfx: string | null | undefined }

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const sp = new URL(req.url).searchParams
  const q = sp.get('q')?.trim()
  const sts = sp.get('sts')
  // 대기 중인 지정·해제·접미어 변경 신청(단어 수정 요청 중 ent_clss_yn 또는 tbl_sfx_txt 를 바꾸는 것)
  // ponytail: 대기 단어 ID를 in() 목록으로 넘김, 대기 건이 수백 건을 넘으면 DB 함수로 옮길 것
  // 권한 확인과 승인대기 조회는 서로 독립 — 동시 실행(R-P1, words #24 의 형제, 2026-10-24 전수 점검)
  const [auth, pend] = await Promise.all([
    requireAreaRole(areaId, 'STD_VIEW'),
    db()
      .from('std_apv_req')
      .select('apv_req_id, tgt_id, aftr_val')
      .eq('area_id', areaId)
      .eq('tgt_tp_cd', 'DIC')
      .eq('act_cd', 'UPD')
      .eq('apv_sts_cd', 'REQ')
      .eq('del_yn', 'N')
      .or('aftr_val->ent_clss_yn.not.is.null,aftr_val->tbl_sfx_txt.not.is.null'),
  ])
  if (auth instanceof NextResponse) return auth
  if (pend.error) return dbError(pend.error)
  const pendBy = new Map<string, Pend>(
    pend.data.map((r) => {
      const v = r.aftr_val as { ent_clss_yn?: string; tbl_sfx_txt?: string | null }
      return [r.tgt_id as string, { req_id: r.apv_req_id as string, ent: v.ent_clss_yn ?? null, sfx: 'tbl_sfx_txt' in v ? v.tbl_sfx_txt : undefined }]
    }),
  )
  const ids = [...pendBy.keys()]
  const build = () => {
    let query = db().from('std_dic').select(COLS, { count: 'exact' }).eq('area_id', areaId).eq('del_yn', 'N').order('std_reg_dtm', { ascending: false }).order('dic_log_nm')
    query = ids.length ? query.or(`ent_clss_yn.eq.Y,dic_id.in.(${ids.join(',')})`) : query.eq('ent_clss_yn', 'Y')
    if (q) {
      const p = likeQ(q)
      query = query.or(`dic_log_nm.ilike.${p},dic_phy_nm.ilike.${p},tbl_sfx_txt.ilike.${p}`)
    }
    return stsFilter(query, sts, 'dic_id', pendBy)
  }
  const r = await pageRows(build, sp, 1000)
  if (r.error) return dbError(r.error)
  try {
    const acts = await withActors(areaId, 'DIC', 'dic_id', r.rows as Record<string, unknown>[])
    const items = acts.map((x) => ({ ...x, pend: pendBy.get(x.dic_id as string) ?? null }))
    return NextResponse.json({ ok: true, items, total: r.total, page: r.page, size: r.size })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
