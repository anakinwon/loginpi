// 번역 자막 순수 규칙(SA8) — 대상 언어 목록·판정, 캐시 키(문장 해시×언어), 모듈 LRU, 사용자당 분당 요청 창.
// 서버(/api/speech/translate)·화면(자막 시트 언어 목록) 공용 — server-only 없음. 시험 : node --test src/lib/translate-rules.test.mjs
// speech-rules 를 import 하지 않는다 — node:test 가 .ts 를 확장자 없이 못 찾음. 글자 상한은 speech-rules MAX_TEXT_CHARS(gemini translate 상한)와 같게 유지
const MAX_TEXT_CHARS = 2_000

// 번역 대상 언어 — 루트 cafe.pi 의 완역 66개 언어(scripts/i18n-lang-map.mjs) 기준 언어 코드.
// seminar.pi src/i18n/routing.ts 는 UI locale(ko·en)만 있고, 루트 routing.ts 는 국가 코드('dz' = 알제리)가 섞여 그대로 못 쓴다
// 표시명은 화면이 Intl.DisplayNames(UI locale)로 만든다 — 번역 파일 불필요
export const TRANSLATE_LANGS = [
  'ko', 'en', 'zh', 'zh-TW', 'ja', 'hi', 'vi', 'af', 'fil', 'th', 'id', 'ms', 'es', 'fr', 'de', 'it', 'ru', 'pt', 'ar',
  'nl', 'el', 'ro', 'sr', 'tr', 'pl', 'cs', 'da', 'fi', 'sv', 'nb', 'is', 'hu', 'bg', 'hr', 'bs', 'sl', 'sk', 'lt', 'lv',
  'et', 'uk', 'ka', 'hy', 'az', 'kk', 'ky', 'uz', 'tg', 'tk', 'mn', 'fa', 'he', 'ur', 'bn', 'ta', 'te', 'mr', 'gu', 'kn',
  'ml', 'pa', 'ne', 'si', 'my', 'km', 'lo', 'sw', 'am', 'ha', 'yo', 'zu', 'so', 'sq', 'mk', 'ga', 'mt',
] as const

export const isTranslateLang = (v: unknown): v is string =>
  typeof v === 'string' && (TRANSLATE_LANGS as readonly string[]).includes(v)

// 언어 기본 부분('pt-BR' → 'pt', 'zh-TW' 는 대만 번체라 그대로) — 자막 언어가 대상과 같으면 요청하지 않는다
export function sameLang(a: string, b: string) {
  if (!a || !b) return false
  const base = (s: string) => (s === 'zh-TW' || s === 'zh-Hant' ? 'zh-TW' : s.split('-')[0].toLowerCase())
  return base(a) === base(b)
}

// 번역할 문장 정리 — 공백 정규화, 빈 글·상한 초과 = null
export function cleanText(v: unknown) {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t && t.length <= MAX_TEXT_CHARS ? t : null
}

// 캐시 키 = 대상 언어 + 문장 sha256(hex) — 같은 문장·언어는 1회만 외부 AI 과금(계획 A-3). Web Crypto(Node·브라우저 공용)
export async function cacheKey(text: string, lang: string) {
  if (!isTranslateLang(lang)) throw new Error('lang')
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return `${lang}:${Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('')}`
}

// 최근 사용 순 캐시 — Map 삽입 순서 = 사용 순서(get 때 맨 뒤로). 넘치면 가장 오래 안 쓴 것부터 버린다
export class Lru<V> {
  private m = new Map<string, V>()
  private max: number
  constructor(max: number) {
    this.max = max
  }
  get(k: string) {
    const v = this.m.get(k)
    if (v === undefined) return undefined
    this.m.delete(k)
    this.m.set(k, v)
    return v
  }
  set(k: string, v: V) {
    this.m.delete(k)
    this.m.set(k, v)
    if (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string)
  }
  delete(k: string) {
    this.m.delete(k)
  }
  get size() {
    return this.m.size
  }
}

// 사용자당 분당 요청 상한(고정 1분 창) — 넘으면 false. 창이 지난 항목은 표가 커질 때 정리
export const TRANSLATE_PER_MIN = 60
export function hitRate(
  table: Map<string, { start: number; n: number }>,
  userId: string,
  now: number,
  max = TRANSLATE_PER_MIN,
  windowMs = 60_000,
) {
  if (table.size > 10_000) for (const [k, w] of table) if (now - w.start >= windowMs) table.delete(k)
  const w = table.get(userId)
  if (!w || now - w.start >= windowMs) {
    table.set(userId, { start: now, n: 1 })
    return true
  }
  w.n++
  return w.n <= max
}
