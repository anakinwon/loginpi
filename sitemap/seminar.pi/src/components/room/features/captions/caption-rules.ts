// 자막 app 메시지 검사(순수 함수) — 엔진은 d 를 검사하지 않으므로 화면이 주제별로 검사해 맞지 않으면 버린다(SIGNAL_API 3.6).
// caption d = {text, ts, lang, sig}(use-speech 가 보냄 — sig = 서버 발급 자막 서명, 번역·더빙 요청에 그대로 전달), state d = 부분 객체 {captions?: boolean, …}. 시험 : node --test src/components/room/features/media-fx/media-fx.test.mjs

export const CAPTION = {
  maxChars: 500, // 표시 상한(5초 조각은 이보다 훨씬 짧다)
  lifeMs: 8_000, // 새 조각이 없으면 사라짐(설계서 15.4 — 조각 3초 + STT·번역 여유)
  resendMs: 1_000, // 늦은 입장자에게 상태 재방송은 1초에 1번 이하(SIGNAL_API 3.6)
}

// tr·trSig = 서버 선번역(마스터 A안 2026-10-31) — 말한 사람의 조각 전사 때 청중이 보는 언어로 같이 번역한 글과 그 서명(언어별). 받는 쪽은 자기 언어가 있으면
//  번역 요청 없이 바로 보이고, 없으면 이전처럼 /api/speech/translate 로 간다(자동 후퇴)
export type Caption = {
  text: string
  ts: number
  lang: string
  sig: string | null
  tr?: Record<string, string>
  trSig?: Record<string, string>
}
const LANG_KEY = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/

// 언어 → 글 사전(선번역). 키는 언어 코드 꼴, 값은 공백 정리 후 상한 안의 빈 글 아님. 비면 undefined
function trMap(v: unknown, maxLen: number, keys?: readonly string[]): Record<string, string> | undefined {
  if (!v || typeof v !== 'object') return undefined
  const out: Record<string, string> = {}
  for (const [k, t] of Object.entries(v as Record<string, unknown>)) {
    if (!LANG_KEY.test(k) || typeof t !== 'string' || (keys && !keys.includes(k))) continue
    const s = t.replace(/\s+/g, ' ').trim().slice(0, maxLen)
    if (s) out[k] = s
  }
  return Object.keys(out).length ? out : undefined
}

export function parseCaption(d: unknown): Caption | null {
  if (!d || typeof d !== 'object') return null
  const o = d as Record<string, unknown>
  if (typeof o.text !== 'string') return null
  const text = o.text.replace(/\s+/g, ' ').trim().slice(0, CAPTION.maxChars)
  if (!text) return null
  const tr = trMap(o.tr, CAPTION.maxChars)
  const c: Caption = {
    text,
    ts: typeof o.ts === 'number' && Number.isFinite(o.ts) ? o.ts : Date.now(),
    lang: typeof o.lang === 'string' ? o.lang.slice(0, 16) : '',
    sig: typeof o.sig === 'string' && o.sig.length <= 64 ? o.sig : null,
  }
  if (tr) {
    c.tr = tr
    const sig = trMap(o.trSig, 64, Object.keys(tr))
    if (sig) c.trSig = sig
  }
  return c
}

// 선번역 꺼내기 — 그 언어 글이 있으면 {text, sig}(서명 없으면 null = 자막엔 쓰되 더빙 합성은 못 받음), 없으면 null
export const preOf = (c: { tr?: Record<string, string>; trSig?: Record<string, string> } | null, lang: string) =>
  c?.tr?.[lang] ? { text: c.tr[lang], sig: c.trSig?.[lang] ?? null } : null

// 엔진 app.send 의 d 는 4096바이트 이하(SIGNAL_API 3.6) — 선번역을 실은 자막이 넘으면 번역을 뒤에서부터 덜어 낸다(원문·서명은 늘 남김)
export const CAPTION_MAX_BYTES = 3_800
const byteLen = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length
export function fitCaption<T extends { tr?: Record<string, string>; trSig?: Record<string, string> }>(d: T, max = CAPTION_MAX_BYTES): T {
  let out: T = { ...d }
  while (byteLen(out) > max && out.tr && Object.keys(out.tr).length) {
    const keys = Object.keys(out.tr)
    const drop = keys[keys.length - 1]
    const tr = { ...out.tr }
    delete tr[drop]
    const trSig = out.trSig ? { ...out.trSig } : undefined
    if (trSig) delete trSig[drop]
    out = { ...out, tr: Object.keys(tr).length ? tr : undefined, trSig: trSig && Object.keys(trSig).length ? trSig : undefined }
  }
  if (out.tr === undefined) delete out.tr
  if (out.trSig === undefined) delete out.trSig
  return out
}

// state 의 자막 켜짐 — 키가 없거나 boolean 이 아니면 null(다른 기능의 state 는 무시)
export function captionsState(d: unknown): boolean | null {
  if (!d || typeof d !== 'object') return null
  const v = (d as Record<string, unknown>).captions
  return typeof v === 'boolean' ? v : null
}

// 자막 글자 크기 — 라디오 그룹 키보드 이동(WAI-ARIA radiogroup : 화살표는 순환, Home·End 는 양 끝). 해당 없는 키면 null
export const SIZES = ['sm', 'md', 'lg'] as const
export type Size = (typeof SIZES)[number]
export function stepSize(cur: Size, key: string): Size | null {
  const i = SIZES.indexOf(cur)
  const n = SIZES.length
  if (key === 'ArrowRight' || key === 'ArrowDown') return SIZES[(i + 1) % n]
  if (key === 'ArrowLeft' || key === 'ArrowUp') return SIZES[(i - 1 + n) % n]
  if (key === 'Home') return SIZES[0]
  if (key === 'End') return SIZES[n - 1]
  return null
}
