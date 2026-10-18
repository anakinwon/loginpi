// 변경 이력 조회 — GET ?tgt=&act=&usr=&from=&to=&page= : 조회자 이상, 최신순 50건 단위(std_audit_log, 변경 전후 값 포함)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { apiError, dbError, requireAreaRole } from '@/lib/api'

type Ctx = { params: Promise<{ areaId: string }> }
const PAGE = 50
const q = z.object({
  tgt: z.enum(['AREA', 'MBR', 'DIC', 'DOM', 'DOM_GRP', 'TERM', 'ABBR', 'PRJ', 'SUBJ', 'ENT', 'REL', 'ATTR']).optional(),
  act: z.enum(['INS', 'UPD', 'DEL']).optional(),
  usr: z.string().trim().max(100).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
})

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'SET_VIEW')
  if (auth instanceof NextResponse) return auth
  const raw = Object.fromEntries([...new URL(req.url).searchParams].filter(([, v]) => v !== ''))
  const p = q.safeParse(raw)
  if (!p.success) return apiError('INVALID_INPUT', 400)
  const f = p.data

  let usrId: string | undefined
  if (f.usr) {
    const u = await db().from('sys_user').select('usr_id').eq('pi_usr_nm', f.usr).eq('del_yn', 'N').maybeSingle()
    if (u.error) return dbError(u.error)
    if (!u.data) return NextResponse.json({ ok: true, items: [], total: 0, page: f.page, size: PAGE })
    usrId = u.data.usr_id
  }
  let query = db()
    .from('std_audit_log')
    .select('log_id, tgt_tp_cd, tgt_id, act_cd, bfr_val, aftr_val, apv_req_id, reg_dtm, sys_user(pi_usr_nm)', { count: 'exact' })
    .eq('area_id', areaId)
  if (f.tgt) query = query.eq('tgt_tp_cd', f.tgt)
  if (f.act) query = query.eq('act_cd', f.act)
  if (usrId) query = query.eq('usr_id', usrId)
  // 날짜는 한국 시간 기준 하루 범위
  if (f.from) query = query.gte('reg_dtm', `${f.from}T00:00:00+09:00`)
  if (f.to) query = query.lt('reg_dtm', new Date(new Date(`${f.to}T00:00:00+09:00`).getTime() + 86400000).toISOString())
  const { data, error, count } = await query.order('reg_dtm', { ascending: false }).range((f.page - 1) * PAGE, f.page * PAGE - 1)
  // 마지막 페이지를 넘는 요청(PGRST103 범위 초과)은 빈 목록
  if (error?.code === 'PGRST103') return NextResponse.json({ ok: true, items: [], total: count ?? 0, page: f.page, size: PAGE })
  if (error) return dbError(error)
  return NextResponse.json({ ok: true, items: data, total: count ?? 0, page: f.page, size: PAGE })
}
