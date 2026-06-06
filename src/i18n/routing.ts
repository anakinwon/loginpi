import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['ko', 'en', 'zh', 'ja', 'hi', 'vi', 'af', 'fil', 'th', 'id', 'ms', 'es', 'fr', 'de', 'it'],
  defaultLocale: 'ko',
  localePrefix: 'as-needed',
})
