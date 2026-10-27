// 자막 app 메시지 검사(순수 함수) — 엔진은 d 를 검사하지 않으므로 화면이 주제별로 검사해 맞지 않으면 버린다(SIGNAL_API 3.6).
// caption d = {text, ts, lang, sig}(use-speech 가 보냄 — sig = 서버 발급 자막 서명, 번역·더빙 요청에 그대로 전달), state d = 부분 객체 {captions?: boolean, …}. 시험 : node --test src/components/room/features/media-fx/media-fx.test.mjs

export const CAPTION = {
  maxChars: 500, // 표시 상한(5초 조각은 이보다 훨씬 짧다)
  lifeMs: 8_000, // 새 조각이 없으면 사라짐(설계서 15.4 — 조각 5초 + 여유)
  resendMs: 1_000, // 늦은 입장자에게 상태 재방송은 1초에 1번 이하(SIGNAL_API 3.6)
}

export type Caption = { text: string; ts: number; lang: string; sig: string | null }

export function parseCaption(d: unknown): Caption | null {
  if (!d || typeof d !== 'object') return null
  const o = d as Record<string, unknown>
  if (typeof o.text !== 'string') return null
  const text = o.text.replace(/\s+/g, ' ').trim().slice(0, CAPTION.maxChars)
  if (!text) return null
  return {
    text,
    ts: typeof o.ts === 'number' && Number.isFinite(o.ts) ? o.ts : Date.now(),
    lang: typeof o.lang === 'string' ? o.lang.slice(0, 16) : '',
    sig: typeof o.sig === 'string' && o.sig.length <= 64 ? o.sig : null,
  }
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
