// 개념 모델 엔터티 이름 규칙(순수 함수) — 표준단어 조합 논리명·물리 테이블명 미리보기·이름 규칙(정의서 §8.4·§8.5, PRD §2.5 MD1)
import type { ErrorCode } from './api'
import { DBMS_PRFL, isDbms } from './modelpi/dbms.ts'

export interface EntWord {
  dic_id: string
  dic_log_nm: string
  dic_phy_nm: string
  attr_clss_yn: string
  ent_clss_yn: string
  forbid_yn: string
  tbl_sfx_txt: string | null
}
// 엔터티 유형 4종(관계형 데이터 모델링 노트 1.2 '데이터 본질에 따른 엔터티 분류법', 마스터 지시 2026-10-20) — 설계 순서 실체 → 기준 → 행위 → 가공
export const ENT_TP = { BASE: '실체', REF: '기준', ACT: '행위', PROC: '가공' } as const
export type EntTp = keyof typeof ENT_TP
export const ENT_TP_DESC: Record<EntTp, string> = {
  BASE: '실제 물체에 대한 본질적인 데이터를 관리(예 : 고객·상품)',
  REF: '실체·행위 데이터의 업무 기준이 되는 데이터를 관리(참조 엔터티 — 코드정보·기본 기준 정보)',
  ACT: '행위·활동으로 발생한 원천 데이터를 관리(가장 많음, 4W1H 복합 식별자, 최대한 통합)',
  PROC: '원천 데이터를 추출·집계한 데이터를 관리(위 3종 외 나머지)',
}
// ERD·모델 화면 유형 색 — 기준 연한 초록 · 실체 연한 노랑 · 행위 연한 파랑 · 가공 색 없음(노트 그림 상자 색, 마스터 확인 2026-10-20)
export const ENT_TP_COLOR: Record<EntTp, { fill: string; head: string; border: string; text: string }> = {
  BASE: { fill: '#fefce8', head: '#fef08a', border: '#ca8a04', text: '#713f12' },
  REF: { fill: '#f0fdf4', head: '#bbf7d0', border: '#16a34a', text: '#14532d' },
  ACT: { fill: '#eff6ff', head: '#bfdbfe', border: '#2563eb', text: '#1e3a8a' },
  PROC: { fill: '#ffffff', head: '#f3f4f6', border: '#6b7280', text: '#111827' },
}
export const entTpColor = (tp: string) => ENT_TP_COLOR[tp as EntTp] ?? ENT_TP_COLOR.BASE
export const TBL_NM_MAX = 25 // 정의서 §8.5 : 인덱스명(X_테이블명_NN) 30자 이내가 되도록 테이블명 25자 이내

// 엔터티 이름 규칙 위반 코드(없으면 null) — 금칙어 불가, 끝 단어가 속성 분류어 전용(도메인)이면 불가(유형 무관 — 집계 접미 강제는 4종 분류로 폐지, 2026-10-20)
export function entNameError(words: EntWord[], _tp?: EntTp): ErrorCode | null {
  if (!words.length) return 'INVALID_INPUT'
  if (words.some((w) => w.forbid_yn === 'Y')) return 'ENT_FORBIDDEN_WORD'
  const last = words[words.length - 1]
  if (last.attr_clss_yn === 'Y' && last.ent_clss_yn !== 'Y') return 'ENT_LAST_ATTR'
  return null
}

// 스키마 접두사(프로젝트 tbl_pfx_txt, sql/023) — 영문 대문자 2~4자, 기본 TB
export const TBL_PFX_RE = /^[A-Z]{2,4}$/
export const TBL_PFX_DEFAULT = 'TB'

// 논리명·물리 테이블명(접두사_주제영역약어_단어약어[접미어]) — 끝 단어가 접미어 있는 엔터티 분류어면 그 단어 약어 대신 접미어(이력 → _H)
// dbms = 프로젝트 대상 DBMS(sql/024) : 식별자 최대 길이 경고만. 이름은 물리 모델링 단계까지 DBMS 와 무관하게 항상 대문자(마스터 지시 2026-10-17) — 대·소문자 선택은 실제 물리 모델 전환 시점에만
export function entNames(words: EntWord[], subjAbbr: string, pfx: string = TBL_PFX_DEFAULT, dbms?: string | null) {
  const last = words[words.length - 1]
  const sfx = last?.ent_clss_yn === 'Y' && last.tbl_sfx_txt ? last.tbl_sfx_txt : ''
  const body = (sfx ? words.slice(0, -1) : words).map((w) => w.dic_phy_nm)
  const phy = `${TBL_PFX_RE.test(pfx) ? pfx : TBL_PFX_DEFAULT}_${subjAbbr}${body.length ? `_${body.join('_')}` : ''}${sfx}`
  const max = isDbms(dbms) ? Math.min(TBL_NM_MAX, DBMS_PRFL[dbms].identMax) : TBL_NM_MAX
  return { ent_log_nm: words.map((w) => w.dic_log_nm).join(''), tbl_phy_nm: phy, tbl_sfx_txt: sfx || null, too_long: phy.length > max }
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
