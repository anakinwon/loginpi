// 세미나 종료 — POST. 개최자 또는 관리자만. SCHEDULED·LIVE → ENDED + end_dtm(PRD D-4). 이미 끝났으면 그대로 성공(멱등).
//  룸 화면의 [세미나 종료]가 엔진 room.end 직전에 부른다 — DB 가 정본이라 엔진을 재시작해도 입장권이 다시 나가지 않는다(입장권 409).
//  비로그인 401(redirect 없음)
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, requireUser } from '@/lib/api'
import { isAdmin } from '@/lib/auth'
import { isUuid, OPEN_STS } from '@/lib/seminar-rules'

const noStore = { 'Cache-Control': 'no-store' }

export const POST = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const [user, { id }] = await Promise.all([
      requireUser(req),
      (ctx as { params: Promise<{ id: string }> }).params,
    ])
    if (user instanceof NextResponse) return user
    if (!isUuid(id)) return apiError('NOT_FOUND', 404)
    const smnId = id.toLowerCase()
    const { data: smn, error } = await db()
      .from('smn_mst')
      .select('hst_usr_id, smn_sts_cd')
      .eq('smn_id', smnId)
      .eq('del_yn', 'N')
      .maybeSingle<{ hst_usr_id: string; smn_sts_cd: string }>()
    if (error) return dbFail(error)
    if (!smn) return apiError('NOT_FOUND', 404)
    if (smn.hst_usr_id !== user.id && !isAdmin(user)) return apiError('FORBIDDEN', 403)
    if ((OPEN_STS as readonly string[]).includes(smn.smn_sts_cd)) {
      // 열린 상태일 때만 바꾼다 — 동시에 두 번 눌러도 한 번만 반영(조건부 갱신)
      const { error: upErr } = await db()
        .from('smn_mst')
        .update({ smn_sts_cd: 'ENDED', end_dtm: new Date().toISOString(), modr_id: user.id })
        .eq('smn_id', smnId)
        .in('smn_sts_cd', [...OPEN_STS])
      if (upErr) return dbFail(upErr)
    }
    return NextResponse.json({ ok: true }, { headers: noStore })
  }),
)
