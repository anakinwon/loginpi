// 연결 API — GET /api/link/v1/domains?offset=&limit= : 토큰 분류체계의 승인완료(CNFM) 표준도메인 [{ domNm, lgcTpCd, dataLen, scale }] (기본 500, 최대 1000)
import { db } from '@/lib/db'
import { linkOk, linkRoute, pageOf } from '@/lib/link/auth'

export const GET = linkRoute(async (req, a) => {
  const { off, lim } = pageOf(req, 500, 1000)
  const r = await db().from('std_dom').select('dom_nm, lgc_tp_cd, data_len, data_scale').eq('area_id', a.areaId).eq('std_sts_cd', 'CNFM').eq('del_yn', 'N').order('dom_nm').range(off, off + lim - 1)
  if (r.error) throw r.error
  return linkOk((r.data as { dom_nm: string; lgc_tp_cd: string; data_len: number | null; data_scale: number | null }[]).map((x) => ({ domNm: x.dom_nm, lgcTpCd: x.lgc_tp_cd, dataLen: x.data_len, scale: x.data_scale })))
})
