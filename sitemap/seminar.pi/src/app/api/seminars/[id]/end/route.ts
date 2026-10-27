// 세미나 종료 — POST. 개최자 또는 관리자만. SCHEDULED·LIVE → ENDED + end_dtm(PRD D-4). 이미 끝났으면 그대로 성공(멱등).
//  룸 화면의 [세미나 종료]가 엔진 room.end 직전에 부른다 — DB 가 정본이라 엔진을 재시작해도 입장권이 다시 나가지 않는다(입장권 409).
//  남은 AI 회의록(RECORDING — 발표자 기기 종료 등으로 끄기가 안 온 것)은 응답 뒤(after) 끝내고 요약한다(M-4 — 고지 없는 기록 차단·'아직 기록 중' 고착 방지).
//  비로그인 401(redirect 없음)
import { after, NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, requireUser } from '@/lib/api'
import { isAdmin } from '@/lib/auth'
import { finishNote } from '@/lib/notes'
import { isUuid, OPEN_STS } from '@/lib/seminar-rules'

const noStore = { 'Cache-Control': 'no-store' }
export const maxDuration = 60 // after 의 회의록 요약 30초 여유

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
    if (smn.hst_usr_id !== user.id && !isAdmin(user))
      return apiError('FORBIDDEN', 403)
    if ((OPEN_STS as readonly string[]).includes(smn.smn_sts_cd)) {
      // 열린 상태일 때만 바꾼다 — 동시에 두 번 눌러도 한 번만 반영(조건부 갱신)
      const { error: upErr } = await db()
        .from('smn_mst')
        .update({
          smn_sts_cd: 'ENDED',
          end_dtm: new Date().toISOString(),
          modr_id: user.id,
        })
        .eq('smn_id', smnId)
        .in('smn_sts_cd', [...OPEN_STS])
      if (upErr) return dbFail(upErr)
    }
    // 이미 끝난 세미나를 다시 불러도 남은 기록을 정리한다(멱등 — finishNote 가 조건부 갱신)
    after(async () => {
      const { data, error: e } = await db()
        .from('smn_nt')
        .select('nt_id')
        .eq('smn_id', smnId)
        .eq('nt_sts_cd', 'RECORDING')
        .eq('del_yn', 'N')
      if (e) return console.error('[seminars/end] 회의록 조회 실패', e.code)
      await Promise.all(
        (data ?? []).map((x) => finishNote(x.nt_id, 'RECORDING', user.id)),
      )
    })
    return NextResponse.json({ ok: true }, { headers: noStore })
  }),
)
