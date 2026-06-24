import { getRequestConfig } from 'next-intl/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { routing } from './routing'

type MessageRecord = Record<string, unknown>

// ko.json을 기반(base)으로, 현재 로케일 번역을 위에 덮어씌운다.
// 번역이 없는 키는 한국어로 표시됨 (key 이름 노출 방지)
function deepMerge(
  base: MessageRecord,
  override: MessageRecord,
): MessageRecord {
  const result: MessageRecord = { ...base }
  for (const [key, val] of Object.entries(override)) {
    // 배열은 재귀 병합 금지 — 통째로 교체. (배열도 typeof === 'object'이므로
    // 재귀하면 {0:…,1:…} 평범한 객체가 되어 .map 등이 깨진다. 예: adminStats.manual.topics)
    if (
      typeof val === 'object' &&
      val !== null &&
      !Array.isArray(val) &&
      typeof base[key] === 'object' &&
      base[key] !== null &&
      !Array.isArray(base[key])
    ) {
      result[key] = deepMerge(base[key] as MessageRecord, val as MessageRecord)
    } else {
      result[key] = val
    }
  }
  return result
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale
  if (
    !locale ||
    !routing.locales.includes(locale as (typeof routing.locales)[number])
  ) {
    locale = routing.defaultLocale
  }

  const koMessages = (await import('../../messages/ko.json'))
    .default as MessageRecord

  if (locale === 'ko') {
    return { locale, messages: koMessages }
  }

  // 영어: ko 위에 en 덮어씌움 (번역 안 된 키는 한국어)
  const readJson = async (file: string): Promise<MessageRecord> => {
    try {
      const raw = await readFile(join(process.cwd(), 'messages', file), 'utf-8')
      return JSON.parse(raw) as MessageRecord
    } catch {
      return {}
    }
  }

  const enMessages = await readJson('en.json')
  const koEnBase = deepMerge(koMessages, enMessages)

  if (locale === 'en') {
    return { locale, messages: koEnBase }
  }

  // 기타 언어: ko → en → locale 순 3단계 fallback
  // 번역 없는 키 → 영어, 영어도 없으면 → 한국어
  const localeMessages = await readJson(`${locale}.json`)
  return { locale, messages: deepMerge(koEnBase, localeMessages) }
})
