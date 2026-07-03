// locale_cd → alpha-2 국가코드 (fi fi-* CSS 플래그용)
// 단일 선언 — language-switcher · admin/i18n/page 공유
// 새 locale 추가 시 이 파일 + locale-currency.ts + routing.ts 세 곳만 수정
export const LOCALE_COUNTRY: Record<string, string> = {
  ko: 'kr',
  en: 'us',
  zh: 'cn',
  ja: 'jp',
  hi: 'in',
  vi: 'vn',
  af: 'za',
  fil: 'ph',
  th: 'th',
  id: 'id',
  ms: 'my',
  es: 'es',
  fr: 'fr',
  de: 'de',
  it: 'it',
  ru: 'ru',
  pt: 'pt',
  ar: 'eg',
  au: 'au', // 호주: 영어권이지만 AUD 통화 분리를 위해 별도 locale
  il: 'il', // 이스라엘: 히브리어(Hebrew) locale
  et: 'et', // 에티오피아: 암하라어 locale, ETB 통화
  mx: 'mx', // 멕시코: 스페인어 공유, MXN 통화 분리를 위해 별도 locale
  ps: 'af', // 아프가니스탄: 파슈토어 locale, AFN 통화
}

// locale_cd → alpha-2 (정적 맵 우선, 없으면 BCP 47 마지막 세그먼트)
export function getAlpha2(locale_cd: string): string {
  return LOCALE_COUNTRY[locale_cd] ?? locale_cd.split('-').pop()!.toLowerCase()
}

// 활성 locale에 대응하는 대문자 country_cd 집합 (중복 필터링용)
export const ACTIVE_COUNTRY_CODES = new Set(
  Object.values(LOCALE_COUNTRY).map((c) => c.toUpperCase()),
)
