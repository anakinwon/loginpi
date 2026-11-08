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

  const readJson = async (file: string): Promise<MessageRecord> => {
    try {
      const raw = await readFile(join(process.cwd(), 'messages', file), 'utf-8')
      return JSON.parse(raw) as MessageRecord
    } catch {
      return {}
    }
  }

  let messages: MessageRecord
  if (locale === 'ko') {
    messages = koMessages
  } else {
    // 영어: ko 위에 en 덮어씌움 (번역 안 된 키는 한국어)
    const enMessages = await readJson('en.json')
    const koEnBase = deepMerge(koMessages, enMessages)
    // 기타 언어: ko → en → locale 순 3단계 fallback
    // 번역 없는 키 → 영어, 영어도 없으면 → 한국어
    messages =
      locale === 'en'
        ? koEnBase
        : deepMerge(koEnBase, await readJson(`${locale}.json`))
  }

  // 메인넷 등재 절제 오버레이(PRD_23 §8.5) — 메시지 빌드 완료 후 최상위로 덮어씌움.
  // 오버레이도 본문과 동일한 ko → en → locale 폴백을 따르므로, listing/<locale>.json이
  // 없는 locale도 en(심사 주 언어) 절제문으로 커버된다 (silent 원문 노출 방지).
  // DB i18n_message 정본·원본 ko.json은 불변 — 로드 후처리라 staging엔 영향 없음.
  if (process.env.NEXT_PUBLIC_LISTING_MODE === 'true') {
    const listingKo = await readJson('listing/ko.json')
    const listingEn = locale === 'ko' ? {} : await readJson('listing/en.json')
    const listingLoc =
      locale === 'ko' || locale === 'en'
        ? {}
        : await readJson(`listing/${locale}.json`)
    messages = deepMerge(
      messages,
      deepMerge(deepMerge(listingKo, listingEn), listingLoc),
    )
    // 오버레이 파일의 _comment(운영 방침 설명)가 번들에 직렬화되면 그 자체가
    // '발행'·'token' 등 절제 대상 단어를 페이지 소스에 노출한다 — 병합 후 제거.
    delete messages._comment
  }

  return { locale, messages }
})
