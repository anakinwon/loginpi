// 연결 API — GET /api/link/v1/conns : 토큰 분류체계의 DB 접속 목록 — 비밀번호·전체 호스트·사용자명 없음(호스트는 가림), 에이전트 최종 확인 일시
import { db } from '@/lib/db'
import { linkOk, linkRoute } from '@/lib/link/auth'
import { maskHost } from '@/lib/link/rules'

type C = { conn_id: string; conn_nm: string; dbms_cd: string; exec_mthd_cd: string; db_nm: string | null; host_nm: string | null; agt_id: string | null; lst_test_dtm: string | null }

export const GET = linkRoute(async (_req, a) => {
  const [c, g] = await Promise.all([
    db().from('mdl_db_conn').select('conn_id, conn_nm, dbms_cd, exec_mthd_cd, db_nm, host_nm, agt_id, lst_test_dtm').eq('area_id', a.areaId).eq('del_yn', 'N').order('conn_nm').limit(200),
    db().from('mdl_db_agt').select('agt_id, lst_seen_dtm').eq('area_id', a.areaId).eq('del_yn', 'N').limit(100),
  ])
  if (c.error) throw c.error
  if (g.error) throw g.error
  const seen = new Map((g.data as { agt_id: string; lst_seen_dtm: string | null }[]).map((x) => [x.agt_id, x.lst_seen_dtm]))
  return linkOk((c.data as C[]).map((x) => ({ connId: x.conn_id, connNm: x.conn_nm, dbmsCd: x.dbms_cd, execMthdCd: x.exec_mthd_cd, dbNm: x.db_nm, hostMasked: maskHost(x.host_nm), lstTestDtm: x.lst_test_dtm, agtLstSeenDtm: x.agt_id ? (seen.get(x.agt_id) ?? null) : null })))
})
