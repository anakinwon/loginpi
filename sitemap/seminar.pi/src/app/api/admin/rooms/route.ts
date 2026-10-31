// 방 관리(M5, PRD_01 5절) — ADMIN 전용. GET ?page=N → 엔진 방(접속자 많은 순, 12개씩) + 세미나 정보(uuid 방만) + 엔진 전역 지표.
//  엔진 관리 API(GET /admin/rooms·/admin/metrics)는 권한 확인 뒤(비인가 요청이 엔진을 부르지 않게) 병렬·2초 제한(R-P1·R-P4).
//  키·주소 미설정 503 ENGINE_OFF, 엔진 목록 실패 503 ENGINE_UNAVAILABLE(지표 실패는 목록을 막지 않고 null). 비로그인 401·비관리자 403(redirect 없음)
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, requireAdmin } from '@/lib/api'
import { engineAdmin, engineAdminOn } from '@/lib/plan'
import { isUuid, parsePage, roomPage, smnTitle, type EngineRoom } from '@/lib/seminar-rules'

const noStore = { 'Cache-Control': 'no-store' }

type SmnRow = {
  smn_id: string
  smn_nm: string
  subttl: string | null
  smn_sts_cd: string
  sys_user: { display_name: string; pi_username: string | null } | null
}

export const GET = withAuthGuard(
  dbRoute(async (req) => {
    const user = await requireAdmin(req)
    if (user instanceof NextResponse) return user
    if (!engineAdminOn()) return apiError('ENGINE_OFF', 503)
    const [rr, mr] = await Promise.all([engineAdmin('/admin/rooms'), engineAdmin('/admin/metrics')])
    const [rooms, metrics] = await Promise.all([
      rr?.ok ? (rr.json().catch(() => null) as Promise<EngineRoom[] | null>) : null,
      mr?.ok ? (mr.json().catch(() => null) as Promise<Record<string, number> | null>) : null,
    ])
    if (!Array.isArray(rooms)) {
      console.error('[admin/rooms] 엔진 방 목록 실패', rr?.status ?? 'network')
      return apiError('ENGINE_UNAVAILABLE', 503)
    }
    const pg = roomPage(rooms, parsePage(req.nextUrl.searchParams.get('page')))
    // 이 쪽의 세미나 방만 조회(R-P3) — 실험실 방(uuid 아님)은 DB 에 없다
    const ids = pg.rows.map((r) => r.id).filter(isUuid)
    const smn = new Map<string, SmnRow>()
    if (ids.length) {
      const { data, error } = await db()
        .from('smn_mst')
        .select('smn_id, smn_nm, subttl, smn_sts_cd, sys_user!smn_mst_sys_user_id_fkey(display_name:dsp_nm, pi_username:pi_usr_nm)')
        .in('smn_id', ids)
        .eq('del_yn', 'N')
        .returns<SmnRow[]>()
      if (error) return dbFail(error)
      for (const s of data) smn.set(s.smn_id, s)
    }
    return NextResponse.json(
      {
        rows: pg.rows.map((r) => {
          const s = smn.get(r.id)
          return {
            ...r,
            seminar: s
              ? {
                  title: smnTitle(s.smn_nm, s.subttl),
                  status: s.smn_sts_cd,
                  host: s.sys_user?.display_name || s.sys_user?.pi_username || '',
                }
              : null,
          }
        }),
        total: pg.total,
        page: pg.page,
        metrics,
      },
      { headers: noStore },
    )
  }),
)
