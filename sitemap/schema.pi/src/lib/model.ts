// 개념 모델(PRD §2.5 MD1) — 주제영역 CRUD 설정, 엔터티 구성 단어 조회(이름 규칙은 model-name.ts)
// 엔터티명 = 표준단어 결합(정의서 §8.4 엔터티 정의 + [데이터 성격 = 엔터티 분류어]), 물리명 = TB_ + 주제영역 약어 + 단어 약어 + 테이블 접미어
import { z } from 'zod'
import { db } from './db'
import { inChunks } from './paging'
import { simpleCrud } from './simple-crud'
import { areaDict } from './term'
import { splitTerm } from './term-split'
import { entNameError, entNames, ENT_TP, type EntTp, type EntWord } from './model-name'
import { CRDN, relError, type Crdn, type RelRule } from './model-rel'
import { INDSTRY_CDS } from './modelpi/template'
import { DBMS_CDS } from './modelpi/dbms'

// 이름이 승인완료 표준단어이거나 표준단어로만 분해되는지(주제영역명 규칙 : 표준에 근거한 이름만, 2026-10-16 마스터 지시)
export async function isStdName(areaId: string, nm: string): Promise<boolean> {
  const dict = await areaDict(areaId)
  const segs = splitTerm(nm.trim(), dict)[0]
  return !!segs?.length && segs.every((s) => 'word' in s)
}

// 승인완료 표준단어를 요청 순서대로(하나라도 없거나 미확정이면 null)
export async function entWords(areaId: string, ids: string[]): Promise<EntWord[] | null> {
  const { data, error } = await inChunks([...new Set(ids)], (p) => db().from('std_dic').select('dic_id, dic_log_nm, dic_phy_nm, attr_clss_yn, ent_clss_yn, forbid_yn, tbl_sfx_txt').eq('area_id', areaId).eq('del_yn', 'N').eq('std_sts_cd', 'CNFM').in('dic_id', p))
  if (error) throw error
  const by = new Map((data as EntWord[]).map((w) => [w.dic_id, w]))
  const out = ids.map((id) => by.get(id))
  return out.every(Boolean) ? (out as EntWord[]) : null
}

// 프로젝트 CRUD(여러 개, 프로젝트명 = 자유 이름, 업종 = 선택(sql/022, 주제영역·엔터티 추천 근거)) — 등록·수정·삭제 = 신청 권한, 주제영역이 있으면 삭제 불가
export const prjCrud = simpleCrud({
  table: 'mdl_prj',
  pk: 'prj_id',
  idParam: 'prjId',
  tgt: 'PRJ',
  cols: 'prj_id, prj_nm, prj_desc, indstry_cd, tbl_pfx_txt, trgt_dbms_cd, sort_seq, ver_no, regr_id, reg_dtm',
  order: 'sort_seq',
  perm: 'MODEL_EDIT',
  viewPerm: 'MODEL_VIEW',
  schema: z.object({ prj_nm: z.string().trim().min(1).max(100), prj_desc: z.string().trim().max(4000).nullable().optional(), indstry_cd: z.enum(INDSTRY_CDS).nullable().optional(), tbl_pfx_txt: z.string().trim().regex(/^[A-Za-z]{2,4}$/).transform((s) => s.toUpperCase()).optional(), trgt_dbms_cd: z.enum(DBMS_CDS), sort_seq: z.number().int().min(1).max(9999).optional() }),
  dupCode: 'PRJ_DUP',
  beforeDelete: async (id) => {
    const { data, error } = await db().from('mdl_subj').select('subj_id').eq('prj_id', id).eq('del_yn', 'N').limit(1)
    if (error) throw error
    return data.length ? 'PRJ_IN_USE' : null
  },
})

// 주제영역 CRUD — 등록·수정·삭제 = 신청 권한(신청 권한 — roles.ts 권한표), 하위 주제영역·엔터티가 있으면 삭제 불가
export const subjCrud = simpleCrud({
  table: 'mdl_subj',
  pk: 'subj_id',
  idParam: 'subjId',
  tgt: 'SUBJ',
  cols: 'subj_id, prj_id, up_subj_id, subj_nm, subj_abbr_nm, subj_desc, sort_seq, ver_no, regr_id, reg_dtm',
  order: 'sort_seq',
  perm: 'MODEL_EDIT',
  viewPerm: 'MODEL_VIEW',
  schema: z.object({
    prj_id: z.string().uuid(),
    up_subj_id: z.string().uuid().nullable().optional(),
    subj_nm: z.string().trim().min(1).max(100),
    subj_abbr_nm: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((s) => s.toUpperCase()),
    subj_desc: z.string().trim().max(4000).nullable().optional(),
    sort_seq: z.number().int().min(1).max(9999).optional(),
  }),
  dupCode: 'SUBJ_DUP',
  beforeSave: async (areaId, row) => ('subj_nm' in row && !(await isStdName(areaId, row.subj_nm as string)) ? 'SUBJ_NOT_WORD' : null),
  beforeDelete: async (id) => {
    const [c, e] = await Promise.all([
      db().from('mdl_subj').select('subj_id').eq('up_subj_id', id).eq('del_yn', 'N').limit(1),
      db().from('mdl_ent').select('ent_id').eq('subj_id', id).eq('del_yn', 'N').limit(1),
    ])
    if (c.error) throw c.error
    if (e.error) throw e.error
    return c.data.length || e.data.length ? 'SUBJ_IN_USE' : null
  },
})

// 엔터티 모델 단계(sql/026) — CNCP 개념 핵심 / LGCL 논리 추가. 보내지 않으면 등록 = DB 기본(CNCP), 수정 = 현재 값 유지
export const MDL_LVLS = ['CNCP', 'LGCL'] as const
export type MdlLvl = (typeof MDL_LVLS)[number]

// 엔터티 등록·수정 본문
export const entSchema = z.object({
  subj_id: z.string().uuid(),
  dic_ids: z.array(z.string().uuid()).min(1).max(20),
  ent_tp_cd: z.enum(Object.keys(ENT_TP) as [EntTp, ...EntTp[]]).default('BASE'),
  ent_desc: z.string().trim().max(4000).nullable().optional(),
  ent_asst_nm: z.string().trim().max(200).nullable().optional(), // 보조명(sql/035, 자유 입력)
  mdl_lvl_cd: z.enum(MDL_LVLS).optional(),
})

// 등록·수정 공용 검증 : 주제영역(같은 분류체계·활성), 구성 단어(승인완료), 이름 규칙 → 이름·미리보기 또는 오류
export async function prepareEnt(areaId: string, b: z.infer<typeof entSchema>) {
  // 주제영역·구성 단어는 서로 독립 — 동시 조회(R-P1, 2026-10-24 전수 점검)
  const [s, words] = await Promise.all([
    db().from('mdl_subj').select('subj_abbr_nm, mdl_prj!mdl_subj_mdl_prj_id_fkey(tbl_pfx_txt, trgt_dbms_cd)').eq('subj_id', b.subj_id).eq('area_id', areaId).eq('del_yn', 'N').maybeSingle<{ subj_abbr_nm: string; mdl_prj: { tbl_pfx_txt: string; trgt_dbms_cd: string } | null }>(),
    entWords(areaId, b.dic_ids),
  ])
  if (s.error) throw s.error
  if (!s.data) return 'NOT_FOUND' as const
  if (!words) return 'ENT_WORD_INVALID' as const
  const bad = entNameError(words, b.ent_tp_cd)
  return bad ?? entNames(words, s.data.subj_abbr_nm, s.data.mdl_prj?.tbl_pfx_txt, s.data.mdl_prj?.trgt_dbms_cd)
}

// 관계(sql/021 mdl_rel) — 목록 열, 본문 스키마, CRUD(등록·수정·삭제 = 신청 권한, 수정은 현재 행과 합쳐 규칙 재검증)
// 부모·자식 = 같은 프로젝트의 활성 엔터티(DB 트리거도 강제 : 23514 → INVALID_INPUT 백스톱)
export const REL_COLS = 'rel_id, prj_id, prnt_ent_id, chld_ent_id, rel_nm, crdn_cd, idnt_yn, prnt_opt_yn, chld_opt_yn, rel_desc, ver_no, regr_id, reg_dtm'
const YN = z.enum(['Y', 'N'])
export const relSchema = z.object({
  prnt_ent_id: z.string().uuid(),
  chld_ent_id: z.string().uuid(),
  rel_nm: z.string().trim().max(100).nullable().optional(),
  // 기본값은 DB 컬럼 DEFAULT(1N·N·N·Y) — zod .default() 는 수정(partial)에서도 채워져 보내지 않은 칸을 덮어쓰므로 쓰지 않는다
  crdn_cd: z.enum(Object.keys(CRDN) as [Crdn, ...Crdn[]]).optional(),
  idnt_yn: YN.optional(),
  prnt_opt_yn: YN.optional(),
  chld_opt_yn: YN.optional(),
  rel_desc: z.string().trim().max(4000).nullable().optional(),
})
export const relCrud = simpleCrud({
  table: 'mdl_rel',
  pk: 'rel_id',
  idParam: 'relId',
  tgt: 'REL',
  cols: REL_COLS,
  order: 'reg_dtm',
  perm: 'MODEL_EDIT',
  viewPerm: 'MODEL_VIEW',
  schema: relSchema,
  dupCode: 'REL_DUP',
  beforeSave: async (areaId, row, cur) => {
    const m = { ...(cur ?? {}), ...row } as unknown as RelRule
    const bad = relError(m)
    if (bad) return bad
    if (!('prnt_ent_id' in row) && !('chld_ent_id' in row)) return null
    // 수정 : 부모·자식이 바뀌는데 이 관계로 상속한 속성이 있으면 차단(원천 속성·상속 속성이 옛 엔터티를 가리키게 됨, PRD_PiErd S0)
    const c = cur as { rel_id?: string; prnt_ent_id?: string; chld_ent_id?: string } | undefined
    if (c?.rel_id && (m.prnt_ent_id !== c.prnt_ent_id || m.chld_ent_id !== c.chld_ent_id)) {
      const fk = await db().from('mdl_attr').select('attr_id').eq('fk_rel_id', c.rel_id).eq('del_yn', 'N').limit(1)
      if (fk.error) throw fk.error
      if (fk.data.length) return 'REL_FK_IN_USE'
    }
    const ids = [...new Set([m.prnt_ent_id, m.chld_ent_id])]
    const { data, error } = await db().from('mdl_ent').select('ent_id, prj_id').eq('area_id', areaId).eq('del_yn', 'N').in('ent_id', ids)
    if (error) throw error
    return data.length === ids.length && new Set(data.map((e) => e.prj_id as string)).size === 1 ? null : 'REL_ENT_INVALID'
  },
})
