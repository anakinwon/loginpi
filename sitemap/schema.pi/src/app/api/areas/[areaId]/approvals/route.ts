// 승인 요청 목록 — GET ?sts=REQ|APV|RJCT|CNCL&tp=DIC|DOM|TERM&act=INS|UPD|DEL&mine=1&page=&size= : 승인권자(DA·STD)는 전체, 그 외는 본인 신청만
// 응답 행 = 요청 + 신청자·처리자 이름 + tgt(대상 현재 이름 : 수정·삭제 요청 표시용)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { dbError, requireAreaRole } from '@/lib/api'
import { pageRows } from '@/lib/paging'

type Ctx = { params: Promise<{ areaId: string }> }
const COLS =
  'apv_req_id, tgt_tp_cd, tgt_id, act_cd, aftr_val, base_ver_no, apv_sts_cd, req_rsn_txt, apv_opn_txt, rjct_rsn_txt, apv_dtm, reg_dtm, req_usr_id, apv_usr_id, ' +
  'req:sys_user!std_apv_req_sys_user_id_fkey(pi_usr_nm), apv:sys_user!std_apv_req_apv_sys_user_id_fkey(pi_usr_nm)'
const NAME_SRC = [
  ['DIC', 'std_dic', 'dic_id', 'dic_log_nm, dic_phy_nm'],
  ['DOM', 'std_dom', 'dom_id', 'dom_nm, key_dom_nm'],
  ['TERM', 'std_term', 'term_id', 'term_log_nm, term_phy_nm'],
] as const
const pick = (v: string | null, ok: string[]) => (v && ok.includes(v) ? v : null)

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const sts = pick(sp.get('sts'), ['REQ', 'APV', 'RJCT', 'CNCL']) ?? 'REQ'
  const tp = pick(sp.get('tp'), ['DIC', 'DOM', 'TERM'])
  const act = pick(sp.get('act'), ['INS', 'UPD', 'DEL'])
  const approver = auth.perms.includes('APPROVE')
  const mine = !approver || sp.get('mine') === '1'
  const build = () => {
    let q = db()
      .from('std_apv_req')
      .select(COLS, { count: 'exact' })
      .eq('area_id', areaId)
      .eq('del_yn', 'N')
      .eq('apv_sts_cd', sts)
      .order(sts === 'REQ' ? 'reg_dtm' : 'apv_dtm', { ascending: sts === 'REQ' })
    if (tp) q = q.eq('tgt_tp_cd', tp)
    if (act) q = q.eq('act_cd', act)
    if (mine) q = q.eq('req_usr_id', auth.user.usr_id)
    return q
  }
  const r = await pageRows(build, sp, 200)
  if (r.error) return dbError(r.error)
  // 대상 현재 이름(수정·삭제 요청은 aftr_val에 이름이 없거나 일부만 있음) — 유형별 1회 조회, 논리 삭제 행 포함
  const rows = r.rows as { tgt_tp_cd: string; tgt_id: string | null; tgt?: Record<string, unknown> }[]
  for (const [tp, table, pk, cols] of NAME_SRC) {
    const ids = [...new Set(rows.filter((x) => x.tgt_tp_cd === tp && x.tgt_id).map((x) => x.tgt_id as string))]
    if (!ids.length) continue
    const n = await db().from(table).select(`${pk}, ${cols}`).in(pk, ids)
    if (n.error) return dbError(n.error)
    const by = new Map((n.data as unknown as Record<string, unknown>[]).map((d) => [d[pk] as string, d]))
    for (const x of rows) if (x.tgt_tp_cd === tp && x.tgt_id) x.tgt = by.get(x.tgt_id)
  }
  return NextResponse.json({ ok: true, role: auth.role, approver, me: auth.user.usr_id, items: r.rows, total: r.total, page: r.page, size: r.size })
}
