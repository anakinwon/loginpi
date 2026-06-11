// 매출 통계 분류 코드 한국어 레이블 — 단일 소스
// msg_theme에 등록되지 않은 시스템 분류 코드 (sql/026_revenue_breakdown.sql의
// fn_top_revenue_themes CASE 매핑과 반드시 동기화 유지)
export const THEME_LABEL: Record<string, string> = {
  SUBSCRIPTION: '구독',
  PI_TIP: '팁',
  DIRECT_PAY: '직접 전송',
  PRODUCT_ORDER: '상품 구매',
  UNKNOWN: '기타',
}

export function themeLabel(cd: string): string {
  return THEME_LABEL[cd] ?? cd
}
