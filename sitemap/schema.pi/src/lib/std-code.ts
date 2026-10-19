// 표준코드(P04, sql/057) — 코드 = 코드형(CD) 도메인을 쓰는 확정 표준용어 1개, 코드값 = 코드 안 유일·길이 ≤ 용어 도메인 길이
//  공용 처리 src/lib/simple-crud.ts(조회 STD_VIEW, 쓰기 STD_REQ — 승인 절차 없이 직접 반영·감사 이력)
import 'server-only'
import { z } from 'zod'
import { db } from './db'
import type { ErrorCode } from './api'
import { simpleCrud } from './simple-crud'

const txt = (n: number) => z.string().trim().max(n).nullable()
const yn = z.enum(['Y', 'N'])

// 용어의 도메인(확정·코드형만) — 없으면 null
async function cdTermDom(areaId: string, termId: string): Promise<{ data_len: number | null } | null> {
  const { data, error } = await db()
    .from('std_term')
    .select('std_dom!inner(dom_tp_cd, data_len)')
    .eq('term_id', termId)
    .eq('area_id', areaId)
    .eq('del_yn', 'N')
    .eq('std_sts_cd', 'CNFM')
    .maybeSingle()
  if (error) throw error
  const d = data?.std_dom as unknown as { dom_tp_cd: string; data_len: number | null } | undefined
  return d?.dom_tp_cd === 'CD' ? { data_len: d.data_len } : null
}

export const codeCrud = simpleCrud({
  table: 'std_cd',
  pk: 'cd_id',
  idParam: 'cdId',
  tgt: 'CD',
  cols: 'cd_id, term_id, cd_cls_nm, cd_desc, use_yn, ver_no, std_term(term_log_nm, term_phy_nm, std_dom(dom_nm))',
  order: 'cd_cls_nm',
  schema: z.object({ term_id: z.string().uuid(), cd_cls_nm: txt(200).optional(), cd_desc: txt(4000).optional(), use_yn: yn.optional() }),
  dupCode: 'CD_DUP_TERM',
  perm: 'STD_REQ',
  viewPerm: 'STD_VIEW',
  beforeSave: async (areaId, row, cur): Promise<ErrorCode | null> => {
    if (!('term_id' in row)) return null
    if (cur) return 'INVALID_INPUT' // 용어 교체 불가(코드값 길이 기준이 바뀜) — 삭제 후 다시 등록
    return (await cdTermDom(areaId, row.term_id as string)) ? null : 'CD_TERM_INVALID'
  },
  beforeDelete: async (id) => {
    const { data, error } = await db().from('std_cd_val').select('cd_val_id').eq('cd_id', id).eq('del_yn', 'N').limit(1)
    if (error) throw error
    return data.length ? 'CD_IN_USE' : null
  },
})

export const codeValCrud = simpleCrud({
  table: 'std_cd_val',
  pk: 'cd_val_id',
  idParam: 'valId',
  tgt: 'CD_VAL',
  cols: 'cd_val_id, cd_id, cd_val, cd_val_nm, cd_val_desc, sort_seq, use_yn, ver_no',
  order: 'sort_seq',
  schema: z.object({
    cd_id: z.string().uuid(),
    cd_val: z.string().trim().min(1).max(100),
    cd_val_nm: z.string().trim().min(1).max(400),
    cd_val_desc: txt(4000).optional(),
    sort_seq: z.coerce.number().int().min(0).max(99999).optional(),
    use_yn: yn.optional(),
  }),
  dupCode: 'CD_VAL_DUP',
  perm: 'STD_REQ',
  viewPerm: 'STD_VIEW',
  listBy: 'cd_id',
  beforeSave: async (areaId, row, cur): Promise<ErrorCode | null> => {
    if (cur && 'cd_id' in row) return 'INVALID_INPUT' // 다른 코드로 이동 불가
    if (!('cd_val' in row) && !('cd_id' in row)) return null
    const cdId = (row.cd_id ?? cur?.cd_id) as string
    const { data, error } = await db().from('std_cd').select('term_id').eq('cd_id', cdId).eq('area_id', areaId).eq('del_yn', 'N').maybeSingle()
    if (error) throw error
    if (!data) return 'NOT_FOUND'
    const dom = await cdTermDom(areaId, data.term_id)
    if (!dom) return 'CD_TERM_INVALID'
    const val = (row.cd_val ?? cur?.cd_val) as string
    return valTooLong(val, dom.data_len) ? 'CD_VAL_TOO_LONG' : null
  },
})

// 코드값 길이 검사(문자 수 기준, 도메인 길이 없음 = 제한 없음)
export const valTooLong = (val: string, len: number | null) => len != null && [...val].length > len
