// 표준도메인 공용 — 입력 스키마, 도메인명 생성(논리타입 약어 조회), 등록 API·미리보기 API 공용
import { z } from 'zod'
import { db } from './db'
import { domName } from './dom-name'

const opt = (max: number) => z.string().trim().max(max).optional()
export const domainSchema = z
  .object({
    key_dom_nm: z.string().trim().min(1).max(150),
    dom_tp_cd: z.enum(['CD', 'NO', 'GNRL']),
    lgc_tp_cd: z.string().regex(/^\d{4}$/),
    data_len: z.number().int().positive().max(100000).optional(),
    data_scale: z.number().int().min(0).max(100).optional(),
    min_val_txt: opt(40),
    max_val_txt: opt(40),
    fmt_txt: opt(4000),
    unit_nm: opt(50),
    alw_val_txt: opt(4000),
    disp_fmt_txt: opt(200),
    dom_desc: opt(4000),
    // 도메인그룹 필수(2026-10-15 결정 B, 행안부 공통표준 전 도메인 그룹 지정)
    dom_grp_id: z.string().uuid(),
    std_se_cd: z.enum(['STD', 'NSTD']).optional(), // 표준구분코드(sql/033), 없으면 STD
  })
  // 소수점은 길이가 있을 때만, 길이 이하
  .refine((d) => d.data_scale === undefined || (d.data_len !== undefined && d.data_scale <= d.data_len))

// 논리타입 약어 조회 → 도메인명 생성(없는 타입이면 null)
export async function buildDomName(d: { key_dom_nm: string; lgc_tp_cd: string; data_len?: number; data_scale?: number }) {
  const { data, error } = await db().from('std_lgc_tp').select('lgc_tp_abbr_nm').eq('lgc_tp_cd', d.lgc_tp_cd).eq('del_yn', 'N').maybeSingle()
  if (error) throw error
  return data ? domName(d.key_dom_nm, data.lgc_tp_abbr_nm, d.data_len, d.data_scale) : null
}

// 대표도메인명 = 확정된 표준단어이면서 속성 분류어이고 대표도메인으로 지정되어야 함(DA 정의서 2장 : 분류어가 도메인을 결정, sql/013). 위반 코드 또는 null
export async function domKeyWordError(areaId: string, keyDomNm: string): Promise<'DOM_KEY_NOT_WORD' | 'DOM_KEY_NOT_ATTR' | 'DOM_KEY_NOT_REG' | null> {
  const { data, error } = await db()
    .from('std_dic')
    .select('attr_clss_yn, key_dom_yn')
    .eq('area_id', areaId)
    .eq('dic_log_nm', keyDomNm.trim())
    .eq('del_yn', 'N')
    .eq('std_sts_cd', 'CNFM')
    .maybeSingle()
  if (error) throw error
  if (!data) return 'DOM_KEY_NOT_WORD'
  if (data.attr_clss_yn !== 'Y') return 'DOM_KEY_NOT_ATTR'
  return data.key_dom_yn === 'Y' ? null : 'DOM_KEY_NOT_REG'
}

// 대표도메인명을 쓰는 활성 도메인 수(지정 해제 차단·관리 화면 표시)
export async function keyDomUseCnt(areaId: string, keyDomNm: string): Promise<number> {
  const { count, error } = await db().from('std_dom').select('dom_id', { count: 'exact', head: true }).eq('area_id', areaId).eq('key_dom_nm', keyDomNm).eq('del_yn', 'N')
  if (error) throw error
  return count ?? 0
}
