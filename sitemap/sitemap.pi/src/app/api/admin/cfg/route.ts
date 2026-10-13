// 관리자 운영 설정 API — GET /api/admin/cfg (sys_cfg 타이머 3종) · PATCH { key, val } (시간, 0.01~720). isAdmin 게이트(401/403)
//  변경 감사(sys_cfg_chg_hist)는 후속 — 지금은 modr_id·mod_dtm 만 남는다(PRD_USAGE_FEE_STATE §4)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { apiError, dbFail, dbRoute, parseBody, requireAdmin } from '@/lib/api'
import {
  CFG_HOUR_MAX,
  CFG_HOUR_MIN,
  CFG_KEYS,
  listCfg,
  setCfg,
} from '@/lib/cfg'

const bodySchema = z.object({
  key: z.enum(CFG_KEYS),
  val: z.number().min(CFG_HOUR_MIN).max(CFG_HOUR_MAX),
})

export const GET = withAuthGuard(
  dbRoute(async (req) => {
    const admin = await requireAdmin(req)
    if (admin instanceof NextResponse) return admin
    try {
      return NextResponse.json({ items: await listCfg() })
    } catch (e) {
      return dbFail(e as { code?: string; message?: string })
    }
  }),
)

export const PATCH = withAuthGuard(
  dbRoute(async (req) => {
    const admin = await requireAdmin(req)
    if (admin instanceof NextResponse) return admin
    const body = await parseBody(req, bodySchema)
    if (body instanceof NextResponse) return body
    // 소수 2자리로 고정(0.05h 같은 검증값 허용, 부동소수 잡음 차단)
    const val = Math.round(body.val * 100) / 100
    if (!(val >= CFG_HOUR_MIN)) return apiError('INVALID_INPUT', 400)
    try {
      await setCfg(body.key, val, admin.id)
      return NextResponse.json({ items: await listCfg() })
    } catch (e) {
      return dbFail(e as { code?: string; message?: string })
    }
  }),
)
