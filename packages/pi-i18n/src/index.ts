// @pi/i18n — 언어 카탈로그·next-intl 라우팅 팩토리·깊은 병합·선호 언어 적용 스크립트 (fs·훅 없음 → proxy/edge 에서도 import 가능)
// 정본 데이터는 catalog.json 하나(CLI 도 같은 파일을 읽음). 규칙 정본 : docs/I18N_STANDARD.md
import { defineRouting } from 'next-intl/routing'
import catalog from './catalog.json' with { type: 'json' }

export { deepMerge, type MessageRecord } from './merge'

export type LocaleDir = 'ltr' | 'rtl'

export interface LocaleInfo {
  code: string
  nativeName: string
  englishName: string
  flag: string
  dir: LocaleDir
}

export const LOCALE_CATALOG: readonly LocaleInfo[] = catalog as LocaleInfo[]
export const ALL_LOCALES: readonly string[] = LOCALE_CATALOG.map((l) => l.code)
export const DEFAULT_LOCALE = 'ko'
export const FALLBACK_CHAIN = ['ko', 'en'] as const

const BY_CODE = new Map(LOCALE_CATALOG.map((l) => [l.code, l]))

export function getLocaleInfo(code: string): LocaleInfo | undefined {
  return BY_CODE.get(code)
}

export function getDir(code: string): LocaleDir {
  return BY_CODE.get(code)?.dir ?? 'ltr'
}

export interface CreateRoutingOptions {
  locales?: 'all' | readonly string[]
  defaultLocale?: string
}

// locales 를 카탈로그 순서로 고르고 검증 — 잘못된 설정은 빌드 시점에 throw
export function resolveLocales(locales: 'all' | readonly string[] = 'all'): string[] {
  if (locales === 'all') return [...ALL_LOCALES]
  const unknown = locales.filter((c) => !BY_CODE.has(c))
  if (unknown.length) throw new Error(`[@pi/i18n] 카탈로그에 없는 locale : ${unknown.join(', ')}`)
  for (const must of FALLBACK_CHAIN) {
    if (!locales.includes(must)) throw new Error(`[@pi/i18n] locales 에 '${must}' 가 반드시 있어야 합니다`)
  }
  return ALL_LOCALES.filter((c) => locales.includes(c))
}

// Pi Browser 는 쿠키를 저장하지 않으므로 감지·쿠키를 끈다(표준 6절 — '/' ↔ '/en' 왕복 루프 방지)
export function createRouting(options: CreateRoutingOptions = {}) {
  return defineRouting({
    locales: resolveLocales(options.locales),
    defaultLocale: options.defaultLocale ?? DEFAULT_LOCALE,
    localePrefix: 'as-needed',
    localeDetection: false,
    localeCookie: false,
  })
}

export { PreferredLocaleScript, type PreferredLocaleScriptProps } from './preferred-locale'
