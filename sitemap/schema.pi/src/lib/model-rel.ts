// 개념 모델 관계 규칙(순수 함수, PRD §2.5 MD1 잔여) — IE 표기·식별 관계 제약. CRUD 설정은 model.ts(relCrud), 저장 = mdl_rel(sql/021)
// 규칙 : N:M·자기참조는 식별 불가, 식별이면 부모 필수(DB CHECK 와 동일)
import type { ErrorCode } from './api'

export const CRDN = { '11': '1:1', '1N': '1:N', NM: 'N:M' } as const
export type Crdn = keyof typeof CRDN

export interface RelRule {
  prnt_ent_id: string
  chld_ent_id: string
  crdn_cd: string
  idnt_yn: string
  prnt_opt_yn: string
}

// 관계 규칙 위반 코드(없으면 null)
export function relError(r: RelRule): ErrorCode | null {
  if (r.idnt_yn !== 'Y') return null
  if (r.crdn_cd === 'NM') return 'REL_NM_IDNT'
  if (r.prnt_ent_id === r.chld_ent_id) return 'REL_SELF_IDNT'
  if (r.prnt_opt_yn === 'Y') return 'REL_IDNT_OPT'
  return null
}

// IE 표기 요약(화면·export 공용) : 부모 ─┼(필수)/○(선택) ── 식별 실선·비식별 점선 ── 자식 까마귀발
export function relNotation(r: RelRule & { chld_opt_yn: string }) {
  const p = r.prnt_opt_yn === 'Y' ? '○' : '┼'
  const line = r.idnt_yn === 'Y' ? '────' : '╌╌╌╌'
  const c = r.crdn_cd === '11' ? (r.chld_opt_yn === 'Y' ? '○┼' : '┼┼') : r.crdn_cd === 'NM' ? '><' : r.chld_opt_yn === 'Y' ? '○<' : '┼<'
  return `${r.crdn_cd === 'NM' ? '>' : ''}${p}${line}${c}`
}
