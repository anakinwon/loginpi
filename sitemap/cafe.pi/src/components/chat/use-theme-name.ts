'use client'
import { useTranslations } from 'next-intl'

// 테마명 표시 공용 훅 — 번역키(themes.<theme_cd>) 우선, 없으면(폐기 테마 등) DB명 폴백.
// theme_nm(한국어)·theme_nm_en(영어) 2단 구조를 189개 locale 번역키 체계로 대체 (2026-07-08)
export function useThemeName() {
  const t = useTranslations('themes')
  return (themeCd?: string | null, fallback?: string | null): string =>
    themeCd && t.has(themeCd) ? t(themeCd) : (fallback ?? themeCd ?? '')
}
