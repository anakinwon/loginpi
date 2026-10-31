// @pi/i18n — loginpi(cafe.pi) 동일 다국어 모델 : routing locale 219개(loginpi routing.ts 그대로)·locale → 언어 매핑·언어 카탈로그 67개·
// 통화/국가 매핑(loginpi 원본 복제)·comboMatch·next-intl 라우팅 팩토리·깊은 병합·선호 언어 적용 스크립트. fs·훅 없음 → proxy/edge 에서도 import 가능
// 데이터 정본 : src/data/*.json(pi-i18n snapshot 이 loginpi 에서 복제)·catalog.json. 규칙 정본 : docs/I18N_STANDARD.md
import { defineRouting } from 'next-intl/routing'
import catalog from './catalog.json' with { type: 'json' }
import localeLang from './data/locale-lang.json' with { type: 'json' }

export { deepMerge, type MessageRecord } from './merge'
export { LOCALE_CURRENCY } from './locale-currency'
export { LOCALE_COUNTRY, ACTIVE_COUNTRY_CODES, getAlpha2 } from './locale-country'
export { comboMatch } from './combo-search'
export { PreferredLocaleScript, type PreferredLocaleScriptProps } from './preferred-locale'

export type LocaleDir = 'ltr' | 'rtl'

/** 언어(번역 소스 단위) — routing locale(국가코드 위주)과 다르다 */
export interface LocaleInfo {
  code: string
  nativeName: string
  englishName: string
  flag: string
  dir: LocaleDir
}

/** 언어 카탈로그 67개 — messages/lang/<code>.json(ko·en 은 messages/ko.json·en.json) 의 코드 */
export const LOCALE_CATALOG: readonly LocaleInfo[] = catalog as LocaleInfo[]
export const ALL_LANGUAGES: readonly string[] = LOCALE_CATALOG.map((l) => l.code)
/** routing locale → 언어 코드(null = loginpi 도 번역 파일 없음 → ko → en 폴백) */
export const LOCALE_LANG: Readonly<Record<string, string | null>> = localeLang
/** loginpi routing.locales 와 같은 목록·순서 (219개) */
export const ROUTING_LOCALES: readonly string[] = Object.keys(localeLang)
/** @deprecated 0.1 호환 — ROUTING_LOCALES 를 쓴다 */
export const ALL_LOCALES = ROUTING_LOCALES
export const DEFAULT_LOCALE = 'ko'
export const FALLBACK_CHAIN = ['ko', 'en'] as const

const BY_CODE = new Map(LOCALE_CATALOG.map((l) => [l.code, l]))

/** 언어 코드 → 카탈로그 정보 */
export function getLocaleInfo(lang: string): LocaleInfo | undefined {
  return BY_CODE.get(lang)
}

/** routing locale → 언어 코드 (예 : ae → ar, am → hy(아르메니아어), et → am(암하라어)) */
export function getLanguage(locale: string): string | null {
  return LOCALE_LANG[locale] ?? null
}

/** routing locale 의 글자 방향 — 실제 언어 기준(il → he → rtl) */
export function getDir(locale: string): LocaleDir {
  return BY_CODE.get(getLanguage(locale) ?? '')?.dir ?? 'ltr'
}

export interface CreateRoutingOptions {
  locales?: 'all' | readonly string[]
  defaultLocale?: string
}

// locales 를 loginpi routing 순서로 고르고 검증 — 잘못된 설정은 빌드 시점에 throw
export function resolveLocales(locales: 'all' | readonly string[] = 'all'): string[] {
  if (locales === 'all') return [...ROUTING_LOCALES]
  const unknown = locales.filter((c) => !Object.hasOwn(LOCALE_LANG, c))
  if (unknown.length) throw new Error(`[@pi/i18n] routing 목록(loginpi)에 없는 locale : ${unknown.join(', ')}`)
  for (const must of FALLBACK_CHAIN) {
    if (!locales.includes(must)) throw new Error(`[@pi/i18n] locales 에 '${must}' 가 반드시 있어야 합니다`)
  }
  return ROUTING_LOCALES.filter((c) => locales.includes(c))
}

// loginpi 와 같은 defaultLocale 'ko'·localePrefix 'as-needed'. 단 Pi Browser 는 쿠키를 저장하지 않으므로 감지·쿠키를 끈다(표준 6절 — '/' ↔ '/en' 왕복 루프 방지)
export function createRouting(options: CreateRoutingOptions = {}) {
  return defineRouting({
    locales: resolveLocales(options.locales),
    defaultLocale: options.defaultLocale ?? DEFAULT_LOCALE,
    localePrefix: 'as-needed',
    localeDetection: false,
    localeCookie: false,
  })
}
