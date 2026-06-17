import { LOCALE_CURRENCY } from './locale-currency'

// 자국통화 표시 유틸 (클라이언트 공용) — locale-currency 단일 소스 기반.

// 지원 통화 코드 — locale별 대표통화 + USD, 중복 제거·정렬
export const SUPPORTED_CCY_CODES: string[] = Array.from(
  new Set<string>([...Object.values(LOCALE_CURRENCY), 'USD']),
).sort()

// locale_cd → 기본 통화코드 (미정의 시 USD 폴백)
export function defaultCcyForLocale(locale: string): string {
  return LOCALE_CURRENCY[locale] ?? 'USD'
}

// 자국통화 금액 포맷 — Intl.NumberFormat(currency). 실패 시 '<amt> <ccy>' 폴백.
export function formatCcy(locale: string, ccyCd: string, amt: number): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: ccyCd,
      maximumFractionDigits: 2,
    }).format(amt)
  } catch {
    return `${amt.toLocaleString()} ${ccyCd}`
  }
}
