// DDL 로컬 에이전트 관리(2026-10-18, sql/039) — GET : 목록(토큰 접두·만료·최종 확인) / POST {agt_nm, days} : 발급(토큰 원문은 이 응답에서만), 접속 관리 권한(DA)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, audit, dbError, parseBody, requireAreaRole } from '@/lib/api'
import { createAgt, listAgts } from '@/lib/model-agent'

type Ctx = { params: Promise<{ areaId: string }> }
const body = z.object({ agt_nm: z.string().trim().min(1).max(100), days: z.number().int().min(1).max(365) })

export async function GET(_req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'DB_CONN_ADMIN')
  if (auth instanceof NextResponse) return auth
  try {
    return NextResponse.json({ ok: true, items: await listAgts(areaId) })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'DB_CONN_ADMIN')
  if (auth instanceof NextResponse) return auth
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  try {
    const r = await createAgt(areaId, b.agt_nm, b.days, auth.user.usr_id)
    await audit({ area_id: areaId, tgt_tp_cd: 'AGT', tgt_id: r.agt.agt_id, act_cd: 'INS', aftr_val: { agt_nm: r.agt.agt_nm, tkn_pfx: r.agt.tkn_pfx, exp_dtm: r.agt.exp_dtm }, usr_id: auth.user.usr_id })
    return NextResponse.json({ ok: true, item: r.agt, token: r.token }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    const x = e as { code?: string; message?: string }
    return x.code === '23505' ? apiError('INVALID_INPUT', 409) : dbError(x)
  }
}
