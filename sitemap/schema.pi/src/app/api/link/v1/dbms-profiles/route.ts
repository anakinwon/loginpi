// 연결 API — GET /api/link/v1/dbms-profiles : DBMS 목록 + 논리타입 → 물리타입 매핑(std_dbms·std_tp_map, 기준 데이터 — 분류체계 무관)
import { db } from '@/lib/db'
import { linkOk, linkRoute } from '@/lib/link/auth'

export const GET = linkRoute(async () => {
  const [d, m] = await Promise.all([
    db().from('std_dbms').select('dbms_cd, dbms_nm').eq('del_yn', 'N').order('dbms_cd').limit(200),
    db().from('std_tp_map').select('dbms_cd, lgc_tp_cd, phy_tp_nm, len_use_yn').eq('del_yn', 'N').order('dbms_cd').order('lgc_tp_cd').limit(5000),
  ])
  if (d.error) throw d.error
  if (m.error) throw m.error
  return linkOk({
    dbms: (d.data as { dbms_cd: string; dbms_nm: string }[]).map((x) => ({ dbmsCd: x.dbms_cd, dbmsNm: x.dbms_nm })),
    typeMap: (m.data as { dbms_cd: string; lgc_tp_cd: string; phy_tp_nm: string; len_use_yn: string }[]).map((x) => ({ dbmsCd: x.dbms_cd, lgcTpCd: x.lgc_tp_cd, phyTpNm: x.phy_tp_nm, lenUseYn: x.len_use_yn })),
  })
})
