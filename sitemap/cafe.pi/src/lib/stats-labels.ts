// 매출 통계 시스템 분류 코드 — 표시명은 i18n(adminAnalytics.theme.<cd>)에서 해석한다.
// msg_theme에 등록되지 않은 시스템 분류 코드 (sql/026_revenue_breakdown.sql의
// fn_top_revenue_themes CASE 매핑과 반드시 동기화 유지)
export const SYSTEM_THEME_CODES = [
  'SUBSCRIPTION',
  'PI_TIP',
  'DIRECT_PAY',
  'PRODUCT_ORDER',
  'UNKNOWN',
] as const

// 시스템 분류 코드 여부 — 참이면 t('adminAnalytics.theme.'+cd)로 표시(그 외는 카페 테마명/코드)
export function isSystemThemeCode(cd: string): boolean {
  return (SYSTEM_THEME_CODES as readonly string[]).includes(cd)
}

// 주요 테마 고정 색 — 서로 뚜렷이 구분 (빈/구독 등 혼동 방지)
const THEME_COLOR_FIXED: Record<string, string> = {
  SUBSCRIPTION: '#3b82f6', // 파랑 (구독)
  PI_TIP: '#f59e0b', // 황금 (빈)
  DIRECT_PAY: '#10b981', // 초록 (직접 전송)
  PRODUCT_ORDER: '#8b5cf6', // 보라 (상품 구매)
  UNKNOWN: '#94a3b8', // 회색 (기타)
}

// fallback 팔레트 — 고정 색과 중복 없는 색 (미등록 테마용)
export const THEME_COLORS = [
  '#ef4444',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#ec4899',
  '#14b8a6',
  '#a855f7',
  '#eab308',
]

// 테마 코드 → 색 (고정 우선, 미등록은 fallback 순환) — 도넛·트리맵 공통 단일 소스
export function themeColorMap(themeCds: string[]): Record<string, string> {
  const m: Record<string, string> = {}
  let fi = 0
  for (const cd of themeCds) {
    const fixed = THEME_COLOR_FIXED[cd]
    if (fixed) {
      m[cd] = fixed
    } else {
      m[cd] = THEME_COLORS[fi % THEME_COLORS.length]
      fi++
    }
  }
  return m
}
