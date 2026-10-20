// 공통코드 명명 규칙(순수 함수, 화면·서버 공용) — 관계형 데이터 모델링 노트 4장 p141 '코드속성(공통코드)의 명명법', 마스터 지시 2026-10-20
//  공통코드 = 이름이 ~구분코드·~종류코드·~유형코드 인 것만(그 외 코드는 공통코드 아님 → 별도 기본테이블). 코드기본 : 코드상세 = 1:N
export const CD_KIND = {
  DIV: { nm: '구분코드', desc: '값이 2~3개로 적고 절대 추가될 일이 없을 때', ex: '남녀구분코드' },
  KND: { nm: '종류코드', desc: '고정적이지 않고 지속적으로 늘어날 수 있을 때', ex: '서비스종류코드, 지불수단종류코드' },
  TYP: { nm: '유형코드', desc: '성질이 유사한 것끼리 묶을 때 · 값이 4개 이상이거나 더 늘어날 수 있을 때', ex: '지불수단유형코드, 거래유형코드, 회원상태유형코드' },
} as const
export type CdKind = keyof typeof CD_KIND
// 구분코드 코드상세 상한(마스터 지시 2026-10-20) — 4개 이상이거나 늘어날 가능성이 있으면 유형코드
export const DIV_MAX = 3

// 공통코드 구분(이름 끝 3종 + 앞에 대상 이름이 있어야 함, 'xxoo코드'), 아니면 null
export function cdKind(termLogNm: string | null | undefined): CdKind | null {
  const nm = (termLogNm ?? '').trim()
  for (const k of Object.keys(CD_KIND) as CdKind[]) if (nm.endsWith(CD_KIND[k].nm) && nm.length > CD_KIND[k].nm.length) return k
  return null
}

// 코드기본 상태별 수정·삭제 처리(sql/061 승인 절차) — 승인대기 = 변경 불가(신청 취소는 승인 화면), 반려 = 수정은 재신청·삭제는 바로 논리 삭제, 승인완료 = 변경 신청
export type BasChgPath = 'LOCKED' | 'RESUB' | 'DROP' | 'REQ'
export const basChgPath = (sts: string, act: 'UPD' | 'DEL'): BasChgPath => (sts === 'REQ' ? 'LOCKED' : sts === 'RJCT' ? (act === 'UPD' ? 'RESUB' : 'DROP') : 'REQ')

// 코드값 금지 문자 — 경로(/codes/[코드ID]/values/[코드값])를 깨거나 두 번 풀릴 수 있는 % / \ ? #
export const CD_VAL_BAD = /[%/\\?#]/

// 코드값 길이 검사(문자 수 기준, 도메인 길이 없음 = 제한 없음) — 화면 등록·일괄등록 공용
export const valTooLong = (val: string, len: number | null) => len != null && [...val].length > len
