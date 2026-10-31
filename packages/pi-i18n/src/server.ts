// @pi/i18n/server — 요청별 메시지 로딩(ko → en → locale 깊은 병합)·next-intl getRequestConfig 래퍼. fs 사용(서버 전용)
// en·locale 은 readFile(빌드 트레이싱 outputFileTracingIncludes 필수 — 표준 7절), ko 는 앱이 정적 import 로 넘긴다.
// 언어 콤보 문구(langSwitcher.*·common.fetching)는 loginpi 각 locale 원문 스냅숏(data/switcher-messages.json)을 바탕에 깔고 앱 메시지가 덮는다 — 앱 messages 에 키 추가 불필요
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getRequestConfig } from 'next-intl/server'
import { deepMerge, type MessageRecord } from './merge'
import switcherMessages from './data/switcher-messages.json' with { type: 'json' }

const SWITCHER = switcherMessages as Record<string, MessageRecord>
const withSwitcher = (locale: string, m: MessageRecord) => deepMerge(SWITCHER[locale] ?? {}, m)

export interface GetMessagesOptions {
  loadSource: () => Promise<MessageRecord | { default: MessageRecord }>
  messagesDir?: string
}

const cache = new Map<string, Promise<MessageRecord>>()

// 최상위 '_' 메타 키 제거 — 메시지 번들 전체가 HTML 에 직렬화되므로(번들 노출 사고 2026-07-16)
function stripMeta(m: MessageRecord): MessageRecord {
  return Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith('_')))
}

async function readJson(dir: string, locale: string): Promise<MessageRecord> {
  try {
    return JSON.parse(await readFile(join(dir, `${locale}.json`), 'utf8')) as MessageRecord
  } catch {
    return {} // 없거나 깨지면 폴백(ko·en)이 메운다
  }
}

async function load(locale: string, options: GetMessagesOptions): Promise<MessageRecord> {
  const src = await options.loadSource()
  const ko = stripMeta(('default' in src && typeof src.default === 'object' ? src.default : src) as MessageRecord)
  if (locale === 'ko') return withSwitcher('ko', ko)
  const dir = options.messagesDir ?? join(process.cwd(), 'messages')
  const [en, own] = await Promise.all([readJson(dir, 'en'), locale === 'en' ? null : readJson(dir, locale)])
  const base = deepMerge(withSwitcher('ko', ko), withSwitcher('en', stripMeta(en)))
  return own ? deepMerge(base, withSwitcher(locale, stripMeta(own))) : base
}

export function getMessages(locale: string, options: GetMessagesOptions): Promise<MessageRecord> {
  // 운영은 locale 별 결과를 모듈 메모리에 캐시(R-P2), 개발은 파일 수정이 바로 보이게 매번 읽음
  if (process.env.NODE_ENV !== 'production') return load(locale, options)
  let hit = cache.get(locale)
  if (!hit) {
    hit = load(locale, options).catch((e) => {
      cache.delete(locale)
      throw e
    })
    cache.set(locale, hit)
  }
  return hit
}

export interface CreateRequestConfigOptions extends GetMessagesOptions {
  routing: { locales: readonly string[]; defaultLocale: string }
}

export function createRequestConfig(options: CreateRequestConfigOptions) {
  const { routing } = options
  return getRequestConfig(async ({ requestLocale }) => {
    const requested = await requestLocale
    const locale = requested && routing.locales.includes(requested) ? requested : routing.defaultLocale
    return { locale, messages: await getMessages(locale, options) }
  })
}
