// 연결 API — GET /api/link/v1/model?prjId=&dbmsCd= : 프로젝트 모델(엔터티·관계 + 물리 테이블·칼럼·인덱스) — 모델↔DB 정합(F5)·이행 계획용
// 물리 모델 = dbmsCd 지정 → 프로젝트 대상 DBMS → 첫 번째 순. 물리 모델이 없으면 tables·columns·indexes 빈 배열. 저장 로더 loadPhy 재사용(R-P1 공용 함수)
import { z } from 'zod'
import { db } from '@/lib/db'
import { linkFail, linkOk, linkRoute } from '@/lib/link/auth'
import { listPhy, loadPhy } from '@/lib/model-phy'

export const GET = linkRoute(async (req, a) => {
  const sp = new URL(req.url).searchParams
  const prjId = sp.get('prjId'), want = sp.get('dbmsCd')
  if (!z.string().uuid().safeParse(prjId).success) return linkFail('INVALID_INPUT', 400)
  // 프로젝트 확인·엔터티·관계·물리 모델 목록은 서로 독립 — 동시 조회, 프로젝트가 이 분류체계 것이 아니면 결과를 버림
  const [p, e, r, phys] = await Promise.all([
    db().from('mdl_prj').select('trgt_dbms_cd').eq('area_id', a.areaId).eq('prj_id', prjId!).eq('del_yn', 'N').maybeSingle(),
    db().from('mdl_ent').select('ent_id, ent_log_nm').eq('area_id', a.areaId).eq('prj_id', prjId!).eq('del_yn', 'N').order('ent_log_nm').limit(5000),
    db().from('mdl_rel').select('rel_id, prnt_ent_id, chld_ent_id, idnt_yn, crdn_cd').eq('area_id', a.areaId).eq('prj_id', prjId!).eq('del_yn', 'N').limit(10000),
    listPhy(a.areaId, prjId!),
  ])
  for (const x of [p, e, r]) if (x.error) throw x.error
  if (!p.data) return linkFail('NOT_FOUND', 404)
  const pick = phys.find((x) => x.dbms_cd === want) ?? (want ? undefined : (phys.find((x) => x.dbms_cd === (p.data as { trgt_dbms_cd: string }).trgt_dbms_cd) ?? phys[0]))
  const phy = pick ? await loadPhy(a.areaId, pick.phy_mdl_id) : null
  const tbls = phy?.tables ?? []
  const tblOfEnt = new Map(tbls.map((t) => [t.ent_id, t.tbl_nm]))
  return linkOk({
    phyMdl: pick ? { phyMdlId: pick.phy_mdl_id, dbmsCd: pick.dbms_cd, idntfrLtrCd: pick.idntfr_ltr_cd } : null,
    entities: (e.data as { ent_id: string; ent_log_nm: string }[]).map((x) => ({ entId: x.ent_id, entNm: x.ent_log_nm, tblNm: tblOfEnt.get(x.ent_id) ?? null })),
    relations: (r.data as { rel_id: string; prnt_ent_id: string; chld_ent_id: string; idnt_yn: string; crdn_cd: string }[]).map((x) => ({ relId: x.rel_id, parentEntId: x.prnt_ent_id, childEntId: x.chld_ent_id, idnYn: x.idnt_yn, cardCd: x.crdn_cd })),
    tables: tbls.map((t) => ({ tblId: t.phy_tbl_id, tblNm: t.tbl_nm, phyStsCd: t.phy_sts_cd })),
    columns: tbls.flatMap((t) => t.cols.map((c) => ({ tblId: t.phy_tbl_id, colNm: c.col_nm, phyTpNm: c.phy_tp_nm, dataLen: c.data_len, nullYn: c.null_yn, pkYn: c.pk_yn, colSeq: c.col_seq }))),
    indexes: tbls.flatMap((t) => t.indexes.map((x) => ({ tblId: t.phy_tbl_id, idxNm: x.idx_nm, unqYn: x.unq_yn, colNms: x.col_nms }))),
  })
})
