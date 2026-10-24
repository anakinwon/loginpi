// seminar.pi locale 정의 — 빌드 시점 고정. 초기 ko(원본)·en
import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['ko', 'en'],
  defaultLocale: 'ko',
  localePrefix: 'as-needed',
})
