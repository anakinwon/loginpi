// 세미나 상세 API(S2) — GET : 세미나·개최자 이름·남은 좌석(max_cnt - 활성 참가)·내 등록 상태·내가 개최자인지.
//  비로그인도 조회 가능(내 상태 = null). 사용자별 값이 섞이므로 no-store. 세 조회는 서로 의존 없음 → 병렬(R-P1)
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { SMN_COLS, toCard, type SmnRow } from '@/lib/seminar'
import { isUuid } from '@/lib/seminar-rules'

export const GET = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const { id } = await (ctx as { params: Promise<{ id: string }> }).params
    if (!isUuid(id)) return apiError('NOT_FOUND', 404)

    const userP = getSessionUser(req)
    const [user, smn, cnt, mine] = await Promise.all([
      userP,
      db()
        .from('smn_mst')
        .select(SMN_COLS)
        .eq('smn_id', id)
        .eq('del_yn', 'N')
        .maybeSingle<SmnRow>(),
      // 남은 좌석 계산용 건수만(행 없음)
      db()
        .from('smn_ptc')
        .select('ptc_id', { count: 'exact', head: true })
        .eq('smn_id', id)
        .eq('del_yn', 'N'),
      userP.then((u) =>
        u
          ? db()
              .from('smn_ptc')
              .select('ptc_id')
              .eq('smn_id', id)
              .eq('usr_id', u.id)
              .eq('del_yn', 'N')
              .maybeSingle()
          : null,
      ),
    ])
    if (smn.error) return dbFail(smn.error)
    if (cnt.error) return dbFail(cnt.error)
    if (mine?.error) return dbFail(mine.error)
    if (!smn.data) return apiError('NOT_FOUND', 404)

    const row = smn.data
    return NextResponse.json(
      {
        ...toCard(row),
        seatsLeft: Math.max(0, row.max_cnt - (cnt.count ?? 0)),
        // null = 비로그인(판정 불가)
        registered: user ? !!mine?.data : null,
        isHost: !!user && user.id === row.hst_usr_id,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  }),
)
