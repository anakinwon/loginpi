// 콤보박스 키인 검색 공용 — 대소문자 무시 부분일치, 다중 필드 대상 (2026-07-08)
// 언어 스위처(189)·통화 콤보(187)·번역 언어 선택 등 대형 목록 콤보에서 공유
export function comboMatch(
  query: string,
  ...fields: (string | null | undefined)[]
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return fields.some((f) => !!f && f.toLowerCase().includes(q))
}
