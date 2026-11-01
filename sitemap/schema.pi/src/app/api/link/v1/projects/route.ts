// 연결 API — GET /api/link/v1/projects?offset=&limit= : 토큰 분류체계의 모델 프로젝트 [{ prjId, prjNm, trgtDbmsCd }] (기본 200, 최대 500)
import { db } from '@/lib/db'
import { linkOk, linkRoute, pageOf } from '@/lib/link/auth'

export const GET = linkRoute(async (req, a) => {
  const { off, lim } = pageOf(req, 200, 500)
  const r = await db().from('mdl_prj').select('prj_id, prj_nm, trgt_dbms_cd').eq('area_id', a.areaId).eq('del_yn', 'N').order('sort_seq').order('prj_nm').range(off, off + lim - 1)
  if (r.error) throw r.error
  return linkOk((r.data as { prj_id: string; prj_nm: string; trgt_dbms_cd: string }[]).map((x) => ({ prjId: x.prj_id, prjNm: x.prj_nm, trgtDbmsCd: x.trgt_dbms_cd })))
})
