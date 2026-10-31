// 메시지 깊은 병합 — 객체만 재귀, 배열·원시값은 override 가 통째로 교체 (loginpi src/i18n/request.ts 와 같음)
// 의존성 없는 순수 함수라 edge·node:test 에서 바로 import 한다
export type MessageRecord = Record<string, unknown>

const isRecord = (v: unknown): v is MessageRecord =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export function deepMerge(base: MessageRecord, override: MessageRecord): MessageRecord {
  const result: MessageRecord = { ...base }
  for (const [key, val] of Object.entries(override)) {
    const prev = base[key]
    result[key] = isRecord(val) && isRecord(prev) ? deepMerge(prev, val) : val
  }
  return result
}
