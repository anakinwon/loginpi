// 표준코드 코드기본의 용어 검사(서버 전용) — std-code.ts(등록)와 approval.ts(승인 시점 재검증)가 함께 쓴다(서로 import 하지 않도록 분리, sql/061)
import 'server-only'
import { db } from './db'
import type { ErrorCode } from './api'
import { cdKind } from './std-code-rule'

export type CdTerm = { term_log_nm: string; term_phy_nm: string; data_len: number | null }

// 용어(확정·코드형 도메인) — 이름·물리명(= 코드ID)·도메인 길이, 아니면 null
export async function cdTerm(areaId: string, termId: string): Promise<CdTerm | null> {
  const { data, error } = await db().from('std_term').select('term_log_nm, term_phy_nm, std_dom!inner(dom_tp_cd, data_len)').eq('term_id', termId).eq('area_id', areaId).eq('del_yn', 'N').eq('std_sts_cd', 'CNFM').maybeSingle()
  if (error) throw error
  const d = data?.std_dom as unknown as { dom_tp_cd: string; data_len: number | null } | undefined
  return data && d?.dom_tp_cd === 'CD' ? { term_log_nm: data.term_log_nm as string, term_phy_nm: data.term_phy_nm as string, data_len: d.data_len } : null
}

// 코드기본이 될 수 있는 용어인지 — 확정·코드형 도메인 + 이름 3종(~구분코드·~종류코드·~유형코드)
export async function cdTermCheck(areaId: string, termId: string): Promise<CdTerm | ErrorCode> {
  const t = await cdTerm(areaId, termId)
  if (!t) return 'CD_TERM_INVALID'
  return cdKind(t.term_log_nm) ? t : 'CD_NAME_NOT_COMMON'
}
