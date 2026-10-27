// 서버가 만든 자막의 서명(HMAC-SHA256) — 번역·합성 음성 라우트가 '서버가 발급한 글'만 받게 한다(보안 검토 D-2 : 임의 글 AI 대행 차단).
// 서명 대상 = 세미나ID·언어·문장(공백 정규화)·만료 시각. 원문 자막 = lang ''(speech/chunk 발급), 번역문 = 대상 언어(speech/translate 발급).
// 서명 값 = '<만료 ms>.<base64url>'. 서버 전용(node:crypto) — 화면은 받은 서명을 그대로 되돌려 보내기만 한다. 시험 : node --test src/lib/caption-sig.test.mjs
import { createHmac, timingSafeEqual } from 'node:crypto'

// 자막은 5초마다 새로 오고 번역·합성은 곧바로 요청된다 — 10분이면 늦은 입장·재시도에 충분, 오래된 자막 재사용은 막는다
export const CAPTION_SIG_TTL_MS = 10 * 60_000
const MAX_SIG_LEN = 64

const norm = (t: string) => t.replace(/\s+/g, ' ').trim()

function mac(secret: string, smnId: string, lang: string, text: string, exp: number) {
  return createHmac('sha256', secret)
    .update(`caption:v1\n${smnId.toLowerCase()}\n${lang}\n${exp}\n${norm(text)}`)
    .digest('base64url')
}

export function signCaption(secret: string, c: { smnId: string; lang: string; text: string }, now = Date.now()) {
  const exp = now + CAPTION_SIG_TTL_MS
  return `${exp}.${mac(secret, c.smnId, c.lang, c.text, exp)}`
}

export function verifyCaption(
  secret: string,
  sig: unknown,
  c: { smnId: string; lang: string; text: string },
  now = Date.now(),
) {
  if (typeof sig !== 'string' || sig.length > MAX_SIG_LEN) return false
  const dot = sig.indexOf('.')
  const exp = Number(sig.slice(0, dot))
  if (dot < 1 || !Number.isSafeInteger(exp) || exp < now || exp > now + CAPTION_SIG_TTL_MS) return false
  const a = Buffer.from(sig.slice(dot + 1))
  const b = Buffer.from(mac(secret, c.smnId, c.lang, c.text, exp))
  return a.length === b.length && timingSafeEqual(a, b)
}
