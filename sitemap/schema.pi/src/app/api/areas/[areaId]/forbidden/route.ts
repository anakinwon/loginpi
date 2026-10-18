// 금칙어 관리(P05) — GET ?q=&tp=SYN|BAN&page=&size= 대체 표기 목록(조회 권한), POST { dic_id, rel_tp_cd, rel_txt } 등록, DELETE ?rel_id= 논리 삭제(승인권자 DA·STD)
// 원칙(sql/016) : 대체 표기(이음동의어 SYN·금칙어 BAN)는 표준단어 이름과 겹칠 수 없고 한 표준단어에만 둔다. 최종 보장은 DB 트리거, 변경은 감사 이력 기록
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { apiError, audit, dbError, parseBody, requireAreaRole } from '@/lib/api'
import { pageRows } from '@/lib/paging'
import { withActors } from '@/lib/approval'

type Ctx = { params: Promise<{ areaId: string }> }
const COLS = 'rel_id, rel_tp_cd, rel_txt, regr_id, reg_dtm, std_dic!inner(dic_id, dic_log_nm, dic_phy_nm, std_sts_cd, area_id, del_yn)'

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'SET_VIEW')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const q = sp.get('q')?.trim()
  const tp = sp.get('tp')
  const build = () => {
    let query = db()
      .from('std_dic_rel')
      .select(COLS, { count: 'exact' })
      .eq('std_dic.area_id', areaId)
      .eq('std_dic.del_yn', 'N')
      .eq('del_yn', 'N')
      .in('rel_tp_cd', tp === 'SYN' || tp === 'BAN' ? [tp] : ['SYN', 'BAN'])
      .order('reg_dtm', { ascending: false })
      .order('rel_txt')
    if (q) query = query.ilike('rel_txt', `%${q.replace(/[%_,()]/g, '')}%`)
    return query
  }
  const r = await pageRows(build, sp, 1000)
  if (r.error) return dbError(r.error)
  try {
    // 등록자 이름(승인 정보는 없음 : 대체 표기는 승인 대상 아님)
    const rows = await withActors(areaId, 'DIC', 'rel_id', r.rows as Record<string, unknown>[])
    return NextResponse.json({ ok: true, items: rows, total: r.total, page: r.page, size: r.size })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

const addSchema = z.object({ dic_id: z.string().uuid(), rel_tp_cd: z.enum(['SYN', 'BAN']), rel_txt: z.string().trim().min(1).max(200) })

export async function POST(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'APPROVE')
  if (auth instanceof NextResponse) return auth
  const body = await parseBody(req, addSchema)
  if (body instanceof NextResponse) return body
  const w = await db().from('std_dic').select('dic_id, dic_log_nm').eq('dic_id', body.dic_id).eq('area_id', areaId).eq('del_yn', 'N').maybeSingle()
  if (w.error) return dbError(w.error)
  if (!w.data) return apiError('NOT_FOUND', 404)
  if (w.data.dic_log_nm === body.rel_txt) return apiError('ALIAS_IS_WORD', 409)
  const uid = auth.user.usr_id
  const { data, error } = await db().from('std_dic_rel').insert({ ...body, regr_id: uid, modr_id: uid }).select('rel_id').single()
  if (error) return dbError(error, 'ALIAS_DUP')
  await audit({ area_id: areaId, tgt_tp_cd: 'DIC', tgt_id: body.dic_id, act_cd: 'UPD', aftr_val: { alias_add: { rel_tp_cd: body.rel_tp_cd, rel_txt: body.rel_txt } }, usr_id: uid })
  return NextResponse.json({ ok: true, rel_id: data.rel_id }, { status: 201 })
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'APPROVE')
  if (auth instanceof NextResponse) return auth
  const id = new URL(req.url).searchParams.get('rel_id') ?? ''
  if (!z.string().uuid().safeParse(id).success) return apiError('INVALID_INPUT', 400)
  const cur = await db().from('std_dic_rel').select('rel_id, dic_id, rel_tp_cd, rel_txt, std_dic!inner(area_id)').eq('rel_id', id).eq('std_dic.area_id', areaId).eq('del_yn', 'N').maybeSingle()
  if (cur.error) return dbError(cur.error)
  if (!cur.data) return apiError('NOT_FOUND', 404)
  const uid = auth.user.usr_id
  const { error } = await db().from('std_dic_rel').update({ del_yn: 'Y', del_dtm: new Date().toISOString(), modr_id: uid }).eq('rel_id', id)
  if (error) return dbError(error)
  await audit({ area_id: areaId, tgt_tp_cd: 'DIC', tgt_id: cur.data.dic_id, act_cd: 'UPD', bfr_val: { alias_del: { rel_tp_cd: cur.data.rel_tp_cd, rel_txt: cur.data.rel_txt } }, usr_id: uid })
  return NextResponse.json({ ok: true })
}
