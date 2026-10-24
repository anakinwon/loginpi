// next-intl 요청별 메시지 로딩 — ko(원본)를 기반으로 현재 locale을 딥머지(cafe src/i18n/request.ts 방식).
// 번역 누락 키는 한국어로 표시(키 이름 노출 방지). 정적 JSON 2종이라 import로 번들에 포함한다
import { getRequestConfig } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import { routing } from './routing'

type MessageRecord = Record<string, unknown>

const isRecord = (v: unknown): v is MessageRecord =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// 배열은 재귀 병합 금지 — 통째로 교체
function deepMerge(
  base: MessageRecord,
  override: MessageRecord,
): MessageRecord {
  const result: MessageRecord = { ...base }
  for (const [key, val] of Object.entries(override)) {
    result[key] =
      isRecord(val) && isRecord(base[key]) ? deepMerge(base[key], val) : val
  }
  return result
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale
  const ko = (await import('../../messages/ko.json')).default as MessageRecord
  const messages =
    locale === 'ko'
      ? ko
      : deepMerge(
          ko,
          (await import(`../../messages/${locale}.json`))
            .default as MessageRecord,
        )
  return { locale, messages }
})
