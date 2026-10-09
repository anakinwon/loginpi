// 조회·클릭 기록 API — POST { siteId, type: 'VIEW'|'CLCK' } → fn_inc_stat_site_dly(원자적 +1).
// 중복 완화는 클라이언트(브라우저 세션당 사이트·유형별 1회) + 가드 rate limit. 공개 엔드포인트(로그인 불필요)
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, parseBody } from '@/lib/api'
import { statInputSchema } from '@/lib/site'

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    const body = await parseBody(req, statInputSchema)
    if (body instanceof NextResponse) return body
    // FK(stat_site_dly → site_mst)가 존재하지 않는 site_id 를 거부한다
    const { error } = await db().rpc('fn_inc_stat_site_dly', {
      p_site_id: body.siteId,
      p_cnt_tp_cd: body.type,
    })
    if (error)
      return error.code === '23503' ? apiError('NOT_FOUND', 404) : dbFail(error)
    return NextResponse.json({ ok: true })
  }),
)
