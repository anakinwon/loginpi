// 표준용어 공용 — 분류체계 단어 사전 조회, 구성 단어 검증, 용어명 중복 확인(분석·등록 API 공용)
import { db } from './db'
import { z } from 'zod'
import type { DicWord } from './term-split'

// 용어 부가 칸(행안부 공통표준 수용, 010) — 허용값·표현형식은 도메인과 다를 때만 입력. 등록·승인 API 공용
const opt = (max: number) => z.string().trim().max(max).optional()
export const termExtShape = { alw_val_txt: opt(4000), disp_fmt_txt: opt(200), adm_cd_nm: opt(200), own_org_nm: opt(200), syn_txt: opt(4000) }

const WORD_COLS = 'dic_id, dic_log_nm, dic_phy_nm, attr_clss_yn, forbid_yn'

// 확정된 활성 단어 전체(분해 사전) — 1,000행씩 나눠 읽음(PostgREST 최대 행 수 제한 : 행안부 3,280건이 1,000건으로 잘리던 결함 수정 2026-10-16)
export async function areaDict<T extends DicWord = DicWord>(areaId: string, cols: string = WORD_COLS): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from('std_dic').select(cols).eq('area_id', areaId).eq('del_yn', 'N').eq('std_sts_cd', 'CNFM').order('dic_id').range(from, from + 999)
    if (error) throw error
    out.push(...(data as unknown as T[]))
    if (data.length < 1000) return out
  }
}

// 요청 순서대로 단어 조회 — 하나라도 없거나 미확정이면 null
export async function wordsByIds(areaId: string, ids: string[]): Promise<DicWord[] | null> {
  const { data, error } = await db().from('std_dic').select(WORD_COLS).eq('area_id', areaId).eq('del_yn', 'N').eq('std_sts_cd', 'CNFM').in('dic_id', [...new Set(ids)])
  if (error) throw error
  const byId = new Map(data.map((w) => [w.dic_id, w]))
  const out = ids.map((id) => byId.get(id))
  return out.every(Boolean) ? (out as DicWord[]) : null
}

export async function areaSep(areaId: string): Promise<string> {
  const { data, error } = await db().from('std_area').select('term_sep_txt').eq('area_id', areaId).single()
  if (error) throw error
  return data.term_sep_txt
}

export async function termDup(areaId: string, logNm: string, phyNm: string) {
  const q = (col: string, v: string) => db().from('std_term').select('term_id').eq('area_id', areaId).eq(col, v).eq('del_yn', 'N').limit(1)
  const [a, b] = await Promise.all([q('term_log_nm', logNm), q('term_phy_nm', phyNm)])
  if (a.error) throw a.error
  if (b.error) throw b.error
  return { dup_log: a.data.length > 0, dup_phy: b.data.length > 0 }
}

// 용어 도메인 검증 — 확정 활성 도메인이면서 대표도메인명 = 용어 끝 단어 논리명(DA 정의서 2장 : 분류어가 도메인을 결정). 위반 코드 또는 null
export async function termDomError(areaId: string, domId: string, lastWordNm: string): Promise<'NOT_FOUND' | 'TERM_DOM_MISMATCH' | null> {
  const { data, error } = await db().from('std_dom').select('key_dom_nm').eq('dom_id', domId).eq('area_id', areaId).eq('del_yn', 'N').eq('std_sts_cd', 'CNFM').maybeSingle()
  if (error) throw error
  if (!data) return 'NOT_FOUND'
  return data.key_dom_nm === lastWordNm ? null : 'TERM_DOM_MISMATCH'
}

// 용어의 끝 단어 논리명(용어 구성 마지막 순번)
export async function termLastWord(termId: string): Promise<string | null> {
  const { data, error } = await db().from('std_term_dic').select('dic_seq, std_dic!inner(dic_log_nm)').eq('term_id', termId).order('dic_seq', { ascending: false }).limit(1)
  if (error) throw error
  return (data[0]?.std_dic as unknown as { dic_log_nm: string } | undefined)?.dic_log_nm ?? null
}
