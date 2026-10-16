// 개념 모델 엔터티 이름 규칙(순수 함수) — 표준단어 조합 논리명·물리 테이블명 미리보기·이름 규칙(정의서 §8.4·§8.5, PRD §2.5 MD1)
import type { ErrorCode } from './api'

export interface EntWord {
  dic_id: string
  dic_log_nm: string
  dic_phy_nm: string
  attr_clss_yn: string
  ent_clss_yn: string
  forbid_yn: string
  tbl_sfx_txt: string | null
}
export const ENT_TP = { BASE: '실체·기준', ACT: '행위', AGG: '집계' } as const
export type EntTp = keyof typeof ENT_TP
export const TBL_NM_MAX = 25 // 정의서 §8.5 : 인덱스명(X_테이블명_NN) 30자 이내가 되도록 테이블명 25자 이내

// 엔터티 이름 규칙 위반 코드(없으면 null) — 금칙어 불가, 끝 단어가 속성 분류어 전용(도메인)이면 불가, 집계 엔터티는 '집계'로 끝남(정의서 §8.4 필수 접미)
export function entNameError(words: EntWord[], tp: EntTp): ErrorCode | null {
  if (!words.length) return 'INVALID_INPUT'
  if (words.some((w) => w.forbid_yn === 'Y')) return 'ENT_FORBIDDEN_WORD'
  const last = words[words.length - 1]
  if (last.attr_clss_yn === 'Y' && last.ent_clss_yn !== 'Y') return 'ENT_LAST_ATTR'
  if (tp === 'AGG' && last.dic_log_nm !== '집계') return 'ENT_AGG_SUFFIX'
  return null
}

// 스키마 접두사(프로젝트 tbl_pfx_txt, sql/023) — 영문 대문자 2~4자, 기본 TB
export const TBL_PFX_RE = /^[A-Z]{2,4}$/
export const TBL_PFX_DEFAULT = 'TB'

// 논리명·물리 테이블명(접두사_주제영역약어_단어약어[접미어]) — 끝 단어가 접미어 있는 엔터티 분류어면 그 단어 약어 대신 접미어(이력 → _H)
export function entNames(words: EntWord[], subjAbbr: string, pfx: string = TBL_PFX_DEFAULT) {
  const last = words[words.length - 1]
  const sfx = last?.ent_clss_yn === 'Y' && last.tbl_sfx_txt ? last.tbl_sfx_txt : ''
  const body = (sfx ? words.slice(0, -1) : words).map((w) => w.dic_phy_nm)
  const phy = `${TBL_PFX_RE.test(pfx) ? pfx : TBL_PFX_DEFAULT}_${subjAbbr}${body.length ? `_${body.join('_')}` : ''}${sfx}`
  return { ent_log_nm: words.map((w) => w.dic_log_nm).join(''), tbl_phy_nm: phy, tbl_sfx_txt: sfx || null, too_long: phy.length > TBL_NM_MAX }
}

// 주제영역 약어 3자 후보(정의서 §8.4) — 한 단어 = 첫 글자 + 뒤 자음 순서(Customer CST·Product PRD·Order ORD·Claim CLM·Delivery DLV),
// 여러 단어 = 머리글자 + 끝 단어 자음으로 3자. 앞쪽 자음 조합부터 돌려줌(중복 제외는 호출 측)
export function subjAbbrCands(eng: string): string[] {
  const ws = eng.toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter((w) => w && !['A', 'AN', 'THE', 'OF', 'AND', 'FOR'].includes(w))
  if (!ws.length) return []
  const out: string[] = []
  const add = (s: string) => s.length === 3 && !out.includes(s) && out.push(s)
  const cons = (w: string) => [...w.slice(1)].filter((c) => !'AEIOUY'.includes(c)).filter((c, i, a) => a.indexOf(c) === i)
  if (ws.length === 1) {
    const w = ws[0]
    const c = cons(w)
    for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) add(w[0] + c[i] + c[j])
    if (!out.length && w.length >= 3) add(w.slice(0, 3))
  } else {
    const ini = ws.map((w) => w[0]).join('')
    if (ini.length >= 3) add(ini.slice(0, 3))
    const last = ws[ws.length - 1]
    for (const c of cons(last)) add(ws[0][0] + last[0] + c)
    for (const c of cons(ws[0])) add(ws[0][0] + c + last[0])
  }
  return out
}
