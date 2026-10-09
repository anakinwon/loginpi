// sitemap.pi locale 정의 — 빌드 시점 고정. 초기 ko(원본)·en, 확장은 cafe.pi 7곳 체크리스트(PRD §다국어)
import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['ko', 'en'],
  defaultLocale: 'ko',
  localePrefix: 'as-needed',
})
