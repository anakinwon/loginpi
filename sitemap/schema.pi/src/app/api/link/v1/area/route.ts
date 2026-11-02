// 연결 API — GET /api/link/v1/area : 토큰 분류체계 { areaId, areaNm } (BUILD_CONTRACT §2.1, 서버 간 전용 Bearer slk_…)
// 토큰 상태 확인용 = 요금제 FREE 여도 통과(PLAN_EXPIRED 예외)
import { db } from '@/lib/db'
import { linkFail, linkOk, linkRoute } from '@/lib/link/auth'

export const GET = linkRoute(async (_req, a) => {
  const r = await db().from('std_area').select('area_id, area_nm').eq('area_id', a.areaId).eq('del_yn', 'N').maybeSingle()
  if (r.error) throw r.error
  if (!r.data) return linkFail('LINK_AUTH', 401) // 분류체계가 삭제되면 토큰도 무효
  return linkOk({ areaId: r.data.area_id, areaNm: r.data.area_nm })
}, { anyPlan: true })
