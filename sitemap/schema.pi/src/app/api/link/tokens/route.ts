// 사이트 연결 토큰(dbms.pi 등, sql/077) — GET ?area= : 활성 토큰 목록(접두·만료·최종 사용) / POST { area, tkn_nm, days } : 발급(원문은 이 응답에서만), 연결 토큰 권한(LINK_ADMIN = SYS·DA ∩ 유료 요금제)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, audit, dbError, parseBody, requireAreaRole } from '@/lib/api'
import { createTkn, listTkns, TKN_MAX } from '@/lib/link/tokens'

const uuid = z.string().uuid()
const body = z.object({ area: uuid, tkn_nm: z.string().trim().min(1).max(100), days: z.number().int().min(1).max(365) })

export async function GET(req: Request) {
  const areaId = new URL(req.url).searchParams.get('area')
  if (!uuid.safeParse(areaId).success) return apiError('INVALID_INPUT', 400)
  const auth = await requireAreaRole(areaId!, 'LINK_ADMIN')
  if (auth instanceof NextResponse) return auth
  try {
    return NextResponse.json({ ok: true, items: await listTkns(areaId!) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export async function POST(req: Request) {
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  const auth = await requireAreaRole(b.area, 'LINK_ADMIN')
  if (auth instanceof NextResponse) return auth
  try {
    if ((await listTkns(b.area)).length >= TKN_MAX) return apiError('INVALID_INPUT', 409) // 상한 — 안 쓰는 토큰을 폐기한 뒤 발급
    const r = await createTkn(b.area, b.tkn_nm, b.days, auth.user.usr_id)
    await audit({ area_id: b.area, tgt_tp_cd: 'LNK_TKN', tgt_id: r.item.tkn_id, act_cd: 'INS', aftr_val: { tkn_nm: r.item.tkn_nm, tkn_pfx: r.item.tkn_pfx, exp_dtm: r.item.exp_dtm }, usr_id: auth.user.usr_id })
    return NextResponse.json({ ok: true, item: r.item, token: r.token }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
