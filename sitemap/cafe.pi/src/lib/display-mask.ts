// 비관리자(게스트 포함)에게 노출되는 표시 이름 마스킹.
// Home 통계의 상위 결제자/활성 사용자 명단은 집계는 공개하되 개인 식별은 가린다.
export function maskDisplayName(name: string | null | undefined): string {
  if (!name) return '익명'
  const trimmed = name.trim()
  if (!trimmed) return '익명'
  if (trimmed.length <= 2) return trimmed[0] + '***'
  return trimmed.slice(0, 2) + '***'
}
