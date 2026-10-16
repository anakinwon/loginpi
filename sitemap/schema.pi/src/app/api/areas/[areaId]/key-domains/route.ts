// 대표도메인 관리 목록 — GET ?q=&sts=&page=&size= : 지정된 단어(key_dom_yn=Y) + 지정·해제 신청 대기 단어, 사용 도메인 수(dom_cnt)
// 지정·해제는 단어 수정 신청(PATCH /words/[dicId] { ver_no, key_dom_yn })으로 처리(sql/013, 승인 절차 공용)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { dbError, requireAreaRole } from '@/lib/api'
import { pageRows } from '@/lib/paging'
import { stsFilter, withActors } from '@/lib/approval'

type Ctx = { params: Promise<{ areaId: string }> }
const COLS = 'dic_id, dic_log_nm, dic_phy_nm, dic_desc, attr_clss_yn, forbid_yn, key_dom_yn, std_sts_cd, ver_no, regr_id, std_reg_dtm'

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const q = sp.get('q')?.trim()
  const sts = sp.get('sts')
  // 대기 중인 지정·해제 신청(단어 수정 요청 중 key_dom_yn 을 바꾸는 것)
  // ponytail: 대기 단어 ID를 in() 목록으로 넘김, 대기 건이 수백 건을 넘으면 DB 함수로 옮길 것
  const pend = await db()
    .from('std_apv_req')
    .select('apv_req_id, tgt_id, aftr_val')
    .eq('area_id', areaId)
    .eq('tgt_tp_cd', 'DIC')
    .eq('act_cd', 'UPD')
    .eq('apv_sts_cd', 'REQ')
    .eq('del_yn', 'N')
    .not('aftr_val->key_dom_yn', 'is', null)
  if (pend.error) return dbError(pend.error)
  const pendBy = new Map(pend.data.map((r) => [r.tgt_id as string, { req_id: r.apv_req_id as string, to: (r.aftr_val as { key_dom_yn?: string }).key_dom_yn ?? null }]))
  const ids = [...pendBy.keys()]
  const build = () => {
    let query = db().from('std_dic').select(COLS, { count: 'exact' }).eq('area_id', areaId).eq('del_yn', 'N').order('std_reg_dtm', { ascending: false }).order('dic_log_nm')
    query = ids.length ? query.or(`key_dom_yn.eq.Y,dic_id.in.(${ids.join(',')})`) : query.eq('key_dom_yn', 'Y')
    if (q) {
      const p = `%${q.replace(/[%_,()]/g, '')}%`
      query = query.or(`dic_log_nm.ilike.${p},dic_phy_nm.ilike.${p}`)
    }
    query = stsFilter(query, sts, 'dic_id', pendBy)
    return query
  }
  const r = await pageRows(build, sp, 1000)
  if (r.error) return dbError(r.error)
  const rows = r.rows as { dic_id: string; dic_log_nm: string }[]
  // 사용 도메인 수 — 현재 페이지 이름만 한 번에 조회해 집계
  const cnt = new Map<string, number>()
  if (rows.length) {
    const d = await db().from('std_dom').select('key_dom_nm').eq('area_id', areaId).eq('del_yn', 'N').in('key_dom_nm', rows.map((x) => x.dic_log_nm))
    if (d.error) return dbError(d.error)
    for (const x of d.data) cnt.set(x.key_dom_nm, (cnt.get(x.key_dom_nm) ?? 0) + 1)
  }
  let acts
  try {
    acts = await withActors(areaId, 'DIC', 'dic_id', rows as unknown as Record<string, unknown>[])
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
  const items = acts.map((x) => ({ ...x, dom_cnt: cnt.get(x.dic_log_nm as string) ?? 0, pend: pendBy.get(x.dic_id as string) ?? null }))
  return NextResponse.json({ ok: true, items, total: r.total, page: r.page, size: r.size })
}
