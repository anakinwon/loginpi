// 도메인명 자동생성 — 대표도메인명 + 논리타입 약어 + 길이[,소수점] (DA# Modeler 매뉴얼 p149 예 : 금액DC18,3 · 주소VC100 · 고객번호CH10)
// 화면 미리보기와 서버 저장이 같은 함수를 쓴다(서버는 클라이언트가 보낸 도메인명을 신뢰하지 않음)
export function domName(keyDomNm: string, typeAbbr: string, len?: number | null, scale?: number | null): string {
  const size = len ? `${len}${scale ? `,${scale}` : ''}` : ''
  return `${keyDomNm.trim()}${typeAbbr}${size}`
}
