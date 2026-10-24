// 표준 데이터 수정·삭제 공용 — 입력 검증, 사용 중 규칙, 이름 재생성·중복 검사 → 반영할 최종 컬럼(p_row) 또는 오류 코드
//  사용 중 규칙 : 활성 용어가 쓰는 단어는 이름·분류어·금칙 변경과 삭제 불가, 활성 용어가 쓰는 도메인은 구조(대표명·유형·타입·길이) 변경과 삭제 불가
//  수정 API·삭제 API·승인 API(UPD·DEL 재검증)가 같은 함수를 쓴다
import { z } from 'zod'
import { db } from './db'
import type { ErrorCode } from './api'
import { buildDomName, domKeyWordError, keyDomUseCnt } from './domain'
import { domGrpValid } from './settings'
import { termDomError, termLastWord } from './term'

export type ChgTp = 'DIC' | 'DOM' | 'TERM'
export type ChgAct = 'UPD' | 'DEL'

const yn = z.enum(['Y', 'N'])
const txt = (max: number) => z.string().trim().max(max).nullable()
const SCHEMA: Record<ChgTp, z.ZodType<Record<string, unknown>>> = {
  DIC: z
    .object({
      dic_log_nm: z.string().trim().min(1).max(200),
      dic_phy_nm: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9]*$/).max(200).transform((s) => s.toUpperCase()),
      dic_eng_nm: txt(500),
      dic_chn_nm: txt(200),
      ent_clss_yn: yn,
      attr_clss_yn: yn,
      forbid_yn: yn,
      dic_desc: txt(4000),
      key_dom_yn: yn,
      std_se_cd: z.enum(['STD', 'NSTD']), // 표준구분코드(sql/033) : STD 표준 / NSTD 비표준
      // 테이블 접미어(sql/017) : 앞 '_' 자동, 대문자, 빈 값 = null
      tbl_sfx_txt: z
        .string()
        .trim()
        .transform((s) => (s ? `_${s.replace(/^_+/, '').toUpperCase()}` : null))
        .refine((s) => s === null || /^_[A-Z0-9]{1,4}$/.test(s))
        .nullable()
        .transform((s) => s ?? null),
    })
    .partial()
    .strict(),
  DOM: z
    .object({
      key_dom_nm: z.string().trim().min(1).max(150),
      dom_tp_cd: z.enum(['CD', 'NO', 'GNRL']),
      lgc_tp_cd: z.string().regex(/^\d{4}$/),
      data_len: z.number().int().positive().max(100000).nullable(),
      data_scale: z.number().int().min(0).max(100).nullable(),
      min_val_txt: txt(40),
      max_val_txt: txt(40),
      fmt_txt: txt(4000),
      unit_nm: txt(50),
      alw_val_txt: txt(4000),
      disp_fmt_txt: txt(200),
      dom_desc: txt(4000),
      dom_grp_id: z.string().uuid(),
      std_se_cd: z.enum(['STD', 'NSTD']),
    })
    .partial()
    .strict(),
  TERM: z.object({ dom_id: z.string().uuid(), term_desc: txt(4000), alw_val_txt: txt(4000), disp_fmt_txt: txt(200), adm_cd_nm: txt(200), own_org_nm: txt(200), syn_txt: txt(4000), std_se_cd: z.enum(['STD', 'NSTD']) }).partial().strict(),
}
const LOCKED: Record<ChgTp, string[]> = {
  DIC: ['dic_log_nm', 'dic_phy_nm', 'attr_clss_yn', 'forbid_yn'],
  DOM: ['key_dom_nm', 'dom_tp_cd', 'lgc_tp_cd', 'data_len', 'data_scale'],
  TERM: ['dom_id'], // 공통코드 코드기본이 쓰는 용어는 도메인 변경 불가(코드값 길이 기준, 2026-10-20)
}
const TABLE = { DIC: ['std_dic', 'dic_id'], DOM: ['std_dom', 'dom_id'], TERM: ['std_term', 'term_id'] } as const
const IN_USE: Record<ChgTp, ErrorCode> = { DIC: 'WORD_IN_USE', DOM: 'DOM_IN_USE', TERM: 'TERM_IN_USE_CD' }

// 활성 용어가 이 단어·도메인을 쓰는지 / 용어 = 활성 공통코드 코드기본이 쓰는지(코드ID = 용어 물리명 복사 자연키, sql/060 — 삭제·도메인 변경 시 어긋남 방지)
async function inUse(tp: ChgTp, id: string, cur?: Record<string, unknown>): Promise<boolean> {
  if (tp === 'TERM') {
    const { data, error } = await db().from('std_cd_bas').select('cd_id').eq('term_id', id).eq('del_yn', 'N').limit(1)
    if (error) throw error
    return data.length > 0
  }
  if (tp === 'DOM') {
    const { data, error } = await db().from('std_term').select('term_id').eq('dom_id', id).eq('del_yn', 'N').limit(1)
    if (error) throw error
    return data.length > 0
  }
  // 용어 구성·개념 모델 엔터티 이름(sql/018)·대표도메인명 사용 여부는 서로 독립 — 동시 조회(R-P1, 2026-10-24 전수 점검)
  const [t, me, d] = await Promise.all([
    db().from('std_term_dic').select('term_id, std_term!inner(del_yn)').eq('dic_id', id).eq('std_term.del_yn', 'N').limit(1),
    db().from('mdl_ent').select('ent_id').contains('dic_ids', [id]).eq('del_yn', 'N').limit(1),
    cur ? db().from('std_dom').select('dom_id').eq('area_id', cur.area_id as string).eq('key_dom_nm', cur.dic_log_nm as string).eq('del_yn', 'N').limit(1) : null,
  ])
  for (const x of [t, me, d]) if (x?.error) throw x.error
  return t.data!.length > 0 || me.data!.length > 0 || (d?.data?.length ?? 0) > 0
}

// 대표도메인 지정·해제 규칙(sql/013) : 지정 상태면 속성 분류어·금칙어 아님 유지, 해제는 사용 도메인 0건일 때만
// 엔터티 분류어·테이블 접미어 규칙(sql/017) : 접미어는 엔터티 분류어 전용, 금칙어 불가, 분류체계 안에서 유일
async function entClssError(areaId: string, id: string, cur: Record<string, unknown>, row: Record<string, unknown>): Promise<ErrorCode | null> {
  if (!['ent_clss_yn', 'tbl_sfx_txt', 'forbid_yn'].some((k) => k in row)) return null
  const m = { ...cur, ...row }
  if (m.tbl_sfx_txt && m.ent_clss_yn !== 'Y') return 'TBL_SFX_NOT_ENT'
  if (m.ent_clss_yn === 'Y' && m.forbid_yn === 'Y') return 'TBL_SFX_NOT_ENT'
  if (row.tbl_sfx_txt) {
    const { data, error } = await db().from('std_dic').select('dic_log_nm').eq('area_id', areaId).eq('tbl_sfx_txt', row.tbl_sfx_txt as string).eq('del_yn', 'N').neq('dic_id', id).limit(1)
    if (error) throw error
    if (data.length) return 'TBL_SFX_DUP'
  }
  return null
}

async function keyDomFlagError(areaId: string, cur: Record<string, unknown>, row: Record<string, unknown>): Promise<ErrorCode | null> {
  const m = { ...cur, ...row }
  if (m.key_dom_yn === 'Y' && ['key_dom_yn', 'attr_clss_yn', 'forbid_yn'].some((k) => k in row)) {
    if (m.attr_clss_yn !== 'Y') return 'DOM_KEY_NOT_ATTR'
    if (m.forbid_yn === 'Y') return 'DOM_KEY_FORBID'
  }
  if (row.key_dom_yn === 'N' && (await keyDomUseCnt(areaId, cur.dic_log_nm as string)) > 0) return 'DOM_KEY_IN_USE'
  return null
}

// 표준단어 이음동의어·동음이의어 차단(표준단어 지침서 3.3, 2026-10-16 마스터 지시) — 등록·수정·중복 검사 공용
// 동음이의어 = 같은 논리명, 이음동의어 = 같은 물리명 또는 기존 단어의 이음동의어로 등록된 표기. 위반 코드 또는 null
export async function wordNameError(areaId: string, log?: string | null, phy?: string | null, excludeId?: string): Promise<ErrorCode | null> {
  const same = async (col: string, v: string) => {
    let q = db().from('std_dic').select('dic_id').eq('area_id', areaId).eq(col, v).eq('del_yn', 'N').limit(1)
    if (excludeId) q = q.neq('dic_id', excludeId)
    const { data, error } = await q
    if (error) throw error
    return data.length > 0
  }
  // 세 검사는 서로 독립 — 동시 조회 후 원래 우선순위로 판정(R-P1, 2026-10-24 전수 점검)
  const [dupLog, syn, dupPhy] = await Promise.all([log ? same('dic_log_nm', log) : false, log ? synOf(areaId, log) : null, phy ? same('dic_phy_nm', phy.toUpperCase()) : false])
  if (dupLog) return 'WORD_DUP_LOGICAL'
  if (syn) return 'WORD_IS_SYNONYM'
  if (dupPhy) return 'WORD_DUP_PHYSICAL'
  return null
}

// 표기가 이 분류체계의 활성 표준단어에 대체 표기(이음동의어 SYN·금칙어 BAN)로 등록되어 있으면 그 표준단어 논리명
export async function synOf(areaId: string, txt: string): Promise<string | null> {
  const { data, error } = await db().from('std_dic_rel').select('std_dic!inner(dic_log_nm, area_id, del_yn)').in('rel_tp_cd', ['SYN', 'BAN']).eq('rel_txt', txt).eq('del_yn', 'N').eq('std_dic.area_id', areaId).eq('std_dic.del_yn', 'N').limit(1)
  if (error) throw error
  return (data[0]?.std_dic as unknown as { dic_log_nm: string } | undefined)?.dic_log_nm ?? null
}

export interface ChgResult {
  row: Record<string, unknown>
  cur: Record<string, unknown>
}

export async function prepareChange(areaId: string, tp: ChgTp, id: string, act: ChgAct, input: unknown): Promise<ChgResult | ErrorCode> {
  const [table, pk] = TABLE[tp]
  const { data: cur, error } = await db().from(table).select('*').eq(pk, id).eq('area_id', areaId).eq('del_yn', 'N').maybeSingle()
  if (error) throw error
  if (!cur) return 'NOT_FOUND'

  if (act === 'DEL') return (await inUse(tp, id, cur)) ? IN_USE[tp] : { row: {}, cur }

  const parsed = SCHEMA[tp].safeParse(input ?? {})
  if (!parsed.success) return 'INVALID_INPUT'
  // 현재 값과 같은 항목은 제외 — 바뀐 컬럼만 반영
  const row = Object.fromEntries(Object.entries(parsed.data).filter(([k, v]) => (v ?? null) !== (cur[k] ?? null)))
  // 엔터티 분류어 해제 시 테이블 접미어도 비움(sql/017 CHECK)
  if (tp === 'DIC' && row.ent_clss_yn === 'N' && cur.tbl_sfx_txt && !('tbl_sfx_txt' in row)) row.tbl_sfx_txt = null
  if (!Object.keys(row).length) return 'NO_CHANGE'
  if (LOCKED[tp].some((k) => k in row) && (await inUse(tp, id, cur))) return IN_USE[tp]
  if (tp === 'DOM' && 'key_dom_nm' in row) {
    const keyErr = await domKeyWordError(areaId, row.key_dom_nm as string)
    if (keyErr) return keyErr
  }

  if (tp === 'DIC') {
    const keyErr = (await keyDomFlagError(areaId, cur, row)) ?? (await entClssError(areaId, id, cur, row))
    if (keyErr) return keyErr
  }
  if (tp === 'DIC' && ('dic_log_nm' in row || 'dic_phy_nm' in row)) {
    const nmErr = await wordNameError(areaId, row.dic_log_nm as string | undefined, row.dic_phy_nm as string | undefined, id)
    if (nmErr) return nmErr
  }
  if (tp === 'DOM' && LOCKED.DOM.some((k) => k in row)) {
    const m = { ...cur, ...row } as { key_dom_nm: string; lgc_tp_cd: string; data_len: number | null; data_scale: number | null }
    if (m.data_scale != null && (m.data_len == null || m.data_scale > m.data_len)) return 'INVALID_INPUT'
    const dom_nm = await buildDomName({ ...m, data_len: m.data_len ?? undefined, data_scale: m.data_scale ?? undefined })
    if (!dom_nm) return 'INVALID_INPUT'
    if (dom_nm !== cur.dom_nm) {
      const d = await db().from('std_dom').select('dom_id').eq('area_id', areaId).eq('dom_nm', dom_nm).eq('del_yn', 'N').neq('dom_id', id).limit(1)
      if (d.error) throw d.error
      if (d.data.length) return 'DOM_DUP_NM'
      row.dom_nm = dom_nm
    }
  }
  if (tp === 'DOM' && 'dom_grp_id' in row && !(await domGrpValid(areaId, row.dom_grp_id as string | null))) return 'NOT_FOUND'
  // 필수화 이전에 그룹 없이 등록된 도메인은 수정 시 그룹 지정 필요
  if (tp === 'DOM' && !cur.dom_grp_id && !('dom_grp_id' in row)) return 'DOM_GRP_REQUIRED'
  if (tp === 'TERM' && 'dom_id' in row) {
    const domErr = await termDomError(areaId, row.dom_id as string, (await termLastWord(id)) ?? '')
    if (domErr) return domErr
  }
  return { row, cur }
}

export const ERR_STATUS = (c: ErrorCode) => (c === 'NOT_FOUND' ? 404 : c === 'INVALID_INPUT' || c === 'NO_CHANGE' || c === 'DOM_GRP_REQUIRED' || c === 'DOM_KEY_NOT_WORD' || c === 'DOM_KEY_NOT_ATTR' || c === 'TBL_SFX_NOT_ENT' || c === 'DOM_KEY_NOT_REG' || c === 'DOM_KEY_FORBID' || c === 'TERM_DOM_MISMATCH' ? 400 : 409)
