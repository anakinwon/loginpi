// 모델 버전(PRD_PiErd S5 ERD-4, sql/065) — GET : 버전 목록(페이지) 또는 ?from=&to= 비교(to 생략 = 현재 모델), POST : 현재 논리 모델 스냅샷 저장, DELETE ?ver= : 논리 삭제
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, audit, dbError, parseBody, requireAreaRole } from '@/lib/api'
import { db } from '@/lib/db'
import { loadLogical } from '@/lib/model-logical'
import { pageRows } from '@/lib/paging'
import { diffCnt, diffSnap, snapCnt, toSnap, type Snap } from '@/lib/modelpi/ver'

type Ctx = { params: Promise<{ areaId: string; prjId: string }> }
const uuid = z.string().uuid()
const body = z.object({ ver_nm: z.string().trim().min(1).max(100), ver_desc: z.string().max(2000).nullish() })
const COLS = 'ver_id, ver_seq, ver_nm, ver_desc, ent_cnt, attr_cnt, rel_cnt, regr_id, reg_dtm'

async function current(areaId: string, prjId: string) {
  const m = await loadLogical(areaId, prjId)
  return m ? { snap: toSnap(m.ents, m.rels), capped: m.capped } : null
}
async function snapOf(areaId: string, prjId: string, verId: string) {
  const r = await db().from('mdl_ver').select('ver_seq, ver_nm, snap_val').eq('ver_id', verId).eq('prj_id', prjId).eq('area_id', areaId).eq('del_yn', 'N').maybeSingle()
  if (r.error) throw r.error
  return r.data as { ver_seq: number; ver_nm: string; snap_val: Snap } | null
}

export async function GET(req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'MODEL_VIEW')
  if (auth instanceof NextResponse) return auth
  if (!uuid.safeParse(prjId).success) return apiError('INVALID_INPUT', 400)
  const sp = new URL(req.url).searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  try {
    if (from) {
      if (!uuid.safeParse(from).success || (to && !uuid.safeParse(to).success)) return apiError('INVALID_INPUT', 400)
      const a = await snapOf(areaId, prjId, from)
      const b = to ? await snapOf(areaId, prjId, to) : null
      const cur = to ? null : await current(areaId, prjId)
      if (!a || (to ? !b : !cur)) return apiError('NOT_FOUND', 404)
      const d = diffSnap(a.snap_val, b ? b.snap_val : cur!.snap)
      return NextResponse.json({ ok: true, from: { ver_seq: a.ver_seq, ver_nm: a.ver_nm }, to: b ? { ver_seq: b.ver_seq, ver_nm: b.ver_nm } : null, diff: d, cnt: diffCnt(d), capped: cur?.capped ?? false })
    }
    const r = await pageRows(() => db().from('mdl_ver').select(COLS, { count: 'exact' }).eq('prj_id', prjId).eq('area_id', areaId).eq('del_yn', 'N').order('ver_seq', { ascending: false }), sp, 100)
    if ('error' in r) throw r.error
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'MODEL_EDIT')
  if (auth instanceof NextResponse) return auth
  if (!uuid.safeParse(prjId).success) return apiError('INVALID_INPUT', 400)
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  try {
    const cur = await current(areaId, prjId)
    if (!cur) return apiError('NOT_FOUND', 404)
    if (cur.capped) return apiError('VER_CAPPED', 400) // ponytail: 상한(엔터티 500·속성 5,000)을 넘는 모델은 일부만 담기므로 저장 거부 — 필요해지면 주제영역 단위 스냅샷으로
    // 순번 = 삭제 포함 최대 + 1(동시 저장은 x_mdl_ver_01(유일 인덱스) 이 막음 → VERSION_CONFLICT, 다시 저장)
    const mx = await db().from('mdl_ver').select('ver_seq').eq('prj_id', prjId).order('ver_seq', { ascending: false }).limit(1).maybeSingle()
    if (mx.error) throw mx.error
    const seq = ((mx.data as { ver_seq: number } | null)?.ver_seq ?? 0) + 1
    const row = { area_id: areaId, prj_id: prjId, ver_seq: seq, ver_nm: b.ver_nm, ver_desc: b.ver_desc ?? null, ...snapCnt(cur.snap) }
    const r = await db().from('mdl_ver').insert({ ...row, snap_val: cur.snap, regr_id: auth.user.usr_id, modr_id: auth.user.usr_id }).select(COLS).single()
    if (r.error) throw r.error
    const item = r.data as { ver_id: string }
    await audit({ area_id: areaId, tgt_tp_cd: 'VER', tgt_id: item.ver_id, act_cd: 'INS', aftr_val: row, usr_id: auth.user.usr_id })
    return NextResponse.json({ ok: true, item }, { status: 201 })
  } catch (e) {
    return dbError(e as { code?: string; message?: string }, 'VERSION_CONFLICT')
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'MODEL_EDIT')
  if (auth instanceof NextResponse) return auth
  const verId = new URL(req.url).searchParams.get('ver')
  if (!uuid.safeParse(prjId).success || !uuid.safeParse(verId).success) return apiError('INVALID_INPUT', 400)
  try {
    const r = await db().from('mdl_ver').update({ del_yn: 'Y', del_dtm: new Date().toISOString(), modr_id: auth.user.usr_id }).eq('ver_id', verId!).eq('prj_id', prjId).eq('area_id', areaId).eq('del_yn', 'N').select('ver_seq, ver_nm')
    if (r.error) throw r.error
    if (!r.data.length) return apiError('NOT_FOUND', 404)
    await audit({ area_id: areaId, tgt_tp_cd: 'VER', tgt_id: verId!, act_cd: 'DEL', bfr_val: r.data[0], usr_id: auth.user.usr_id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
