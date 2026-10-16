// 분류체계 설정 항목 정의 — 도메인그룹(사용 중 삭제 불가)·약어
import { z } from 'zod'
import { db } from './db'
import { simpleCrud } from './simple-crud'

const txt = (max: number) => z.string().trim().max(max).nullable()

export const domGrpCrud = simpleCrud({
  table: 'std_dom_grp',
  pk: 'dom_grp_id',
  idParam: 'grpId',
  tgt: 'DOM_GRP',
  cols: 'dom_grp_id, dom_grp_nm, dom_grp_desc, ver_no',
  order: 'dom_grp_nm',
  schema: z.object({ dom_grp_nm: z.string().trim().min(1).max(200), dom_grp_desc: txt(4000).optional() }),
  dupCode: 'GRP_DUP_NM',
  beforeDelete: async (id) => {
    const { data, error } = await db().from('std_dom').select('dom_id').eq('dom_grp_id', id).eq('del_yn', 'N').limit(1)
    if (error) throw error
    return data.length ? 'GRP_IN_USE' : null
  },
})

export const abbrCrud = simpleCrud({
  table: 'std_abbr',
  pk: 'abbr_id',
  idParam: 'abbrId',
  tgt: 'ABBR',
  cols: 'abbr_id, abbr_log_nm, abbr_phy_nm, obj_tp_cd, ver_no',
  order: 'abbr_log_nm',
  schema: z.object({
    abbr_log_nm: z.string().trim().min(1).max(200),
    abbr_phy_nm: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]*$/).max(100).transform((s) => s.toUpperCase()),
    // 객체유형 코드 값 목록 [확인중 : Wordict 약어 관리 객체타입 값]
    obj_tp_cd: txt(20).optional(),
  }),
  dupCode: 'ABBR_DUP_NM',
})

// 도메인그룹이 이 분류체계의 활성 그룹인지
export async function domGrpValid(areaId: string, grpId: string | null | undefined) {
  if (!grpId) return true
  const { data, error } = await db().from('std_dom_grp').select('dom_grp_id').eq('dom_grp_id', grpId).eq('area_id', areaId).eq('del_yn', 'N').maybeSingle()
  if (error) throw error
  return !!data
}
