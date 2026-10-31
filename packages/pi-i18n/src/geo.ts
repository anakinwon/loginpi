// @pi/i18n 접속 국가 → 언어 — 하루 첫 접속(수동 선택 전)에 IP 국가로 언어를 고를 때 쓰는 대응표(순수 함수, fs·훅 없음)
// 규칙 : routing locale 순서대로 보며 그 나라를 대표국(getAlpha2)으로 둔 첫 locale 을 고른다 — loginpi 순서는 언어 locale(ko·en·ja …)이
//  앞이라 KR → ko, US → en, JP → ja 가 국가코드 locale(kr·us…)보다 먼저 잡힌다. 대응이 없는 나라 = 표에 없음(현재 언어 유지)
import { getAlpha2 } from './locale-country'

export function countryLocaleMap(locales: readonly string[]): Record<string, string> {
  const m: Record<string, string> = {}
  for (const l of locales) {
    const c = getAlpha2(l)
    if (/^[a-z]{2}$/.test(c) && !m[c]) m[c] = l
  }
  return m
}

/** 국가코드(대소문자 무관) → routing locale, 없으면 null */
export function countryToLocale(country: string | null | undefined, locales: readonly string[]): string | null {
  return country ? (countryLocaleMap(locales)[country.toLowerCase()] ?? null) : null
}
