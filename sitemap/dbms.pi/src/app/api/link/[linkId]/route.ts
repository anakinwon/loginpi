// 연결 해제 — DELETE /api/link/[linkId] : 본인 연결만 논리삭제(del_yn='Y', 물리 DELETE 금지). 남의·없는 연결 = 404
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, requireUser } from '@/lib/api'

type Ctx = { params: Promise<{ linkId: string }> }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const DELETE = withGuard(
  dbRoute(async (req, ctx) => {
    const [user, { linkId }] = await Promise.all([requireUser(req), (ctx as Ctx).params])
    if (user instanceof NextResponse) return user
    if (!UUID_RE.test(linkId)) return apiError('NOT_FOUND', 404)
    const now = new Date().toISOString()
    // 소유 확인 = 조건(usr_id) — 조회 1회 절약
    const { data, error } = await db()
      .from('dbm_lnk')
      .update({ del_yn: 'Y', del_dtm: now, modr_id: user.id, mod_dtm: now })
      .eq('lnk_id', linkId)
      .eq('usr_id', user.id)
      .eq('del_yn', 'N')
      .select('lnk_id')
    if (error) return dbFail(error)
    if (!data?.length) return apiError('NOT_FOUND', 404)
    return NextResponse.json({ ok: true })
  }),
)
