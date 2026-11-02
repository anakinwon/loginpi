// 사이트 연결 토큰 폐기 — DELETE ?area= : 논리 삭제(즉시 무효), 연결 토큰 권한(LINK_ADMIN = SYS·DA ∩ 유료 요금제)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, audit, dbError, requireAreaRole } from '@/lib/api'
import { revokeTkn } from '@/lib/link/tokens'

type Ctx = { params: Promise<{ tknId: string }> }
const uuid = z.string().uuid()

export async function DELETE(req: Request, { params }: Ctx) {
  const { tknId } = await params
  const areaId = new URL(req.url).searchParams.get('area')
  if (!uuid.safeParse(areaId).success || !uuid.safeParse(tknId).success) return apiError('INVALID_INPUT', 400)
  const auth = await requireAreaRole(areaId!, 'LINK_ADMIN')
  if (auth instanceof NextResponse) return auth
  try {
    if (!(await revokeTkn(areaId!, tknId, auth.user.usr_id))) return apiError('NOT_FOUND', 404)
    await audit({ area_id: areaId!, tgt_tp_cd: 'LNK_TKN', tgt_id: tknId, act_cd: 'DEL', usr_id: auth.user.usr_id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
