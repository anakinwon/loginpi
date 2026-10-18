// DDL 로컬 에이전트 폐기(2026-10-18) — DELETE : 논리 삭제(토큰 즉시 무효), 접속 관리 권한(DA)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, audit, dbError, requireAreaRole } from '@/lib/api'
import { revokeAgt } from '@/lib/model-agent'

type Ctx = { params: Promise<{ areaId: string; agtId: string }> }

export async function DELETE(_req: Request, { params }: Ctx) {
  const { areaId, agtId } = await params
  const auth = await requireAreaRole(areaId, 'DB_CONN_ADMIN')
  if (auth instanceof NextResponse) return auth
  if (!z.string().uuid().safeParse(agtId).success) return apiError('INVALID_INPUT', 400)
  try {
    if (!(await revokeAgt(areaId, agtId, auth.user.usr_id))) return apiError('NOT_FOUND', 404)
    await audit({ area_id: areaId, tgt_tp_cd: 'AGT', tgt_id: agtId, act_cd: 'DEL', usr_id: auth.user.usr_id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
