// 번역 자막 순수 규칙(SA8) — 대상 언어 목록·판정, 캐시 키(문장 해시×언어), 모듈 LRU, 사용자당 분당 요청 창.
// 서버(/api/speech/translate)·화면(자막 시트 언어 목록) 공용 — server-only 없음. 시험 : node --test src/lib/translate-rules.test.mjs
// speech-rules 를 import 하지 않는다 — node:test 가 .ts 를 확장자 없이 못 찾음. 글자 상한 = 자막 표시 상한 CAPTION.maxChars(500, 시험이 같음을 확인)
export const MAX_TEXT_CHARS = 500

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

// BCP-47 코드 → 번역 대상 언어 키. 대소문자 무시·옛 코드 정규화(Intl.Locale : iw→he, in→id, tl→fil, ji→yi),
//  중국어는 문자 체계로(번체 = zh-TW : zh-tw·zh-Hant·zh-Hant-TW·zh-HK, 간체 = zh), 노르웨이어 'no' = 'nb'. 형식 오류·빈 값 = ''
// 외부 AI 가 돌려주는 자막 언어 표기('zh-tw'·'iw' 등)가 대상 코드와 글자만 달라 같은 언어를 문장마다 번역·합성하던 낭비 방지(야간 시험 r3 T08)
export function trLangOf(code: unknown): string {
  if (typeof code !== 'string' || !code) return ''
  let l: Intl.Locale
  try {
    l = new Intl.Locale(code)
  } catch {
    return ''
  }
  if (l.language === 'zh') return l.maximize().script === 'Hant' ? 'zh-TW' : 'zh'
  if (l.language === 'no') return 'nb'
  return l.language
}

// 자막 언어가 대상과 같으면 요청하지 않는다('pt-BR' = 'pt', 'zh-TW' ≠ 'zh'). 감지 실패('') = 다름(요청 — 외부 AI 가 같은 언어면 그대로 돌려줌)
export function sameLang(a: string, b: string) {
  const x = trLangOf(a)
  return !!x && x === trLangOf(b)
}

// 번역할 글자가 있는지 — 숫자·문장부호·기호뿐인 자막('2026', '…', '10:30', '😀')은 어느 언어로도 같아서 번역 요청 없이 원문(보강 r6 T08 — 외부 AI 비용·DB 계량 절감)
export const hasWords = (t: string) => /\p{L}/u.test(t)

// 언어 목록 앞에 둘 '내 언어' — 브라우저 선호 언어·UI locale·지금 고른 언어 순으로 대상 키로 바꿔 순서대로(중복 제거).
//  76개 언어 select 를 360px 화면에서 끝까지 훑지 않게(보강 r6 T08). 목록 밖 언어는 뺀다
export function prefLangs(prefs: readonly string[] | undefined, locale: string, current: string) {
  const out: string[] = []
  for (const c of [...(prefs ?? []), locale, current]) {
    const k = trLangOf(c)
    if (isTranslateLang(k) && !out.includes(k)) out.push(k)
  }
  return out
}

// 번역 언어 기본값(사용자가 아직 안 골랐을 때) — 브라우저 선호 언어(navigator.languages) 중 대상 목록에 있는 첫 언어 → UI locale → 'en'.
//  UI 는 ko·en 뿐이라 베트남어 브라우저 사용자도 영어로 기본 번역되던 것을 자기 언어로(야간 시험 r3 T08 보강)
export function pickTrLang(prefs: readonly string[] | undefined, locale: string) {
  for (const c of [...(prefs ?? []), locale]) {
    const k = trLangOf(c)
    if (isTranslateLang(k)) return k
  }
  return 'en'
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

// 캐시 미스 공유(야간 시험 r3 T09) — 자막 1문장은 청중 전원에게 동시에 방송돼 번역·합성 요청이 한꺼번에 온다.
//  판정(gate = fn_use_smn_ai 1왕복)이 끝난 뒤에 캐시에 넣으면 그 왕복 동안 온 청중 전원이 미스로 계량돼 세미나 누적 글자가 청중 수만큼 빨리 닳는다
//  (청중 20명이면 더빙 상한 20만 자가 몇 분 만에 소진 → SPEECH_QUOTA 로 전원 더빙 꺼짐). 그래서 판정 전에 작업 Promise 를 먼저 넣는다 —
//  뒤에 온 같은 문장·언어는 적중 분기(aiGate, 차감 없음)로 같은 Promise 를 기다린다.
//  첫 요청이 실패하면 Promise = null, 거절되면 DENIED + 둘 다 캐시에서 지움. gate 예외는 첫 요청에게 그대로 던진다
//  거절은 개인 사유(상한·자격)라 나눠 갖지 않는다 — 기다리던 쪽은 DENIED 를 받으면 자기 판정(shareMiss)으로 다시 간다(보안 검토 2026-10-28)
export const DENIED = Symbol('denied')
export type Shared<V> = Promise<V | null | typeof DENIED>
export async function shareMiss<V, D>(
  cache: Lru<Shared<V>>,
  key: string,
  gate: () => Promise<D | null>,
  work: () => Promise<V | null>,
): Promise<{ denied: D | null; p: Shared<V> }> {
  const g = gate()
  const p: Shared<V> = g.then<V | null | typeof DENIED>((d) => (d ? DENIED : work())).catch(() => null)
  cache.set(key, p)
  void p.then((v) => {
    if ((v === null || v === DENIED) && cache.get(key) === p) cache.delete(key)
  })
  return { denied: await g, p }
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

// 세미나별 외부 AI 글자 상한(sql/010 fn_use_smn_ai, 보안 검토 D-2) — 캐시 미스만 센다.
//  번역 : 120분 발화 ≈ 원문 10만 자 × 듣는 언어 10개 = 100만 자. 합성 음성은 비싸서 20만 자. 사용자 분당 = 실시간 자막 여러 배 여유
export const AI_LIMIT = {
  TRANS: { maxChr: 1_000_000, maxMinChr: 6_000 },
  TTS: { maxChr: 200_000, maxMinChr: 3_000 },
} as const

// 사용자 1인(세미나 × 사용자) 누적 글자 상한 기본값(감사 High 1) — 계정 몇 개로 세미나 상한(AI_LIMIT)을 다 써서 전원 번역·더빙을 끄지 못하게.
//  세미나 상한의 1/10 : 세미나 1건을 다 쓰려면 참가 등록한 계정 10개가 필요하고, 1계정 피해는 세미나 상한의 10% 로 묶인다.
//  번역 10만 자 = 120분 발화 원문(≈10만 자)을 혼자 다른 언어로 끝까지 듣는 정상 청중도 막히지 않는 값(같은 문장·언어 캐시 적중은 안 센다).
//  합성 2만 자 = 혼자 듣는 언어면 약 20~25분 분량 — 합성이 번역보다 비싸서 보수적으로. env SPEECH_USR_TRANS_CHR·SPEECH_USR_TTS_CHR 로 조절
export const USR_AI_LIMIT = { TRANS: 100_000, TTS: 20_000 } as const
// 사용자 누적 상한 — env 값이 없거나 이상하면 기본값, 세미나 상한을 넘지 못하게
export function usrAiMax(kind: 'TRANS' | 'TTS', envVal: number | undefined) {
  const v = Number.isInteger(envVal) && (envVal as number) >= 1 ? (envVal as number) : USR_AI_LIMIT[kind]
  return Math.min(v, AI_LIMIT[kind].maxChr)
}

// 서버 발급 자막 서명(D-2) — 번역·합성은 서버가 만든 글(음성→글 결과 · 번역 결과)만 받는다(임의 글 AI 대행 차단).
// sig = HMAC-SHA256(파생키, 용도 줄바꿈 smnId 줄바꿈 cleanText(text)) base64url.
// 용도 분리(감사 High 1) : 자막(음성→글) = CAP_USE('smn-cap', 번역·더빙 둘 다 받음) · 번역 결과 = trUse(lang)('smn-tr:<언어>', 그 언어 더빙만 받음).
//  번역 결과 서명을 번역에 다시 넣어 되번역하거나, 다른 언어 음성으로 합성(캐시 미스 = 계량만 늘림)하는 재사용을 막는다. 파생키 = HMAC(secret, 'smn-cap-key:v1') — 세션 서명과 키 분리.
// Web Crypto(서버 전용으로만 부른다 — secret 은 서버 env). 검증은 crypto.subtle.verify(상수 시간)
const keys = new Map<string, Promise<CryptoKey>>()
const enc = new TextEncoder()
function capKey(secret: string) {
  let k = keys.get(secret)
  if (!k) {
    k = crypto.subtle
      .importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      .then((m) => crypto.subtle.sign('HMAC', m, enc.encode('smn-cap-key:v1')))
      .then((raw) => crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']))
    keys.set(secret, k)
  }
  return k
}
export const CAP_USE = 'smn-cap'
export const trUse = (lang: string) => `smn-tr:${lang}`
const capMsg = (use: string, smnId: string, t: string) => enc.encode([use, smnId.toLowerCase(), t].join('\n'))

// 서명 — 글이 비었거나 상한 초과면 null(서명 없는 자막 = 번역·합성 불가, 원문만 표시)
export async function capSig(secret: string, smnId: string, text: string, use = CAP_USE) {
  const t = cleanText(text)
  if (!t) return null
  const s = await crypto.subtle.sign('HMAC', await capKey(secret), capMsg(use, smnId, t))
  return Buffer.from(s).toString('base64url')
}

// uses = 받을 용도 목록(기본 자막만) — 하나라도 맞으면 통과
export async function capSigOk(
  secret: string,
  smnId: string,
  text: string,
  sig: unknown,
  uses: readonly string[] = [CAP_USE],
) {
  const t = cleanText(text)
  if (!t || typeof sig !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(sig)) return false
  const k = await capKey(secret)
  const raw = Buffer.from(sig, 'base64url')
  const ok = await Promise.all(uses.map((u) => crypto.subtle.verify('HMAC', k, raw, capMsg(u, smnId, t))))
  return ok.includes(true)
}

// 번역·합성 실패 응답 → 이번 입장 동안 요청을 멈출 사유. 문장마다 같은 결과가 되풀이되는 실패만(R-P2 — 청중 수 × 문장 수만큼 헛된 왕복·DB 잠금 방지)
//  권한 없음(401·403 : 무료 세미나를 방 링크로 바로 들어와 입장 등록이 없는 경우 등) · 서버 AI 미설정(503 AI_UNAVAILABLE) · 세미나 누적 한도(429 SPEECH_QUOTA) · 사용자 누적 한도(429 SPEECH_USR_QUOTA)
//  일시 실패(분당 한도 SPEECH_RATE·DB 503·502·409·네트워크)는 null = 다음 문장에 다시 시도
//  사용자 1인 누적 한도(429 SPEECH_USR_QUOTA, 감사 High 1)도 이 세미나 동안 회복되지 않는다 = usrQuota
export type TrStop = 'forbidden' | 'unavailable' | 'quota' | 'usrQuota'
//  서명 불일치(403 CAPTION_SIG_INVALID)는 그 문장만의 문제 — 패널 1명의 변조·고장 자막 1개가 청중 전원의 번역을 입장 내내 끄고
//  '입장 등록한 참가자만' 이라는 틀린 사유를 띄우던 결함(야간 시험 r5 T08). 그 문장만 원문으로 둔다
export function trStopOf(status: number, code: unknown): TrStop | null {
  if (code === 'CAPTION_SIG_INVALID') return null
  if (status === 401 || status === 403) return 'forbidden'
  if (status === 503 && code === 'AI_UNAVAILABLE') return 'unavailable'
  if (status === 429 && code === 'SPEECH_QUOTA') return 'quota'
  if (status === 429 && code === 'SPEECH_USR_QUOTA') return 'usrQuota'
  return null
}

// 번역 언어를 바꾼 뒤 요청까지 기다리는 시간 — 닫힌 select 에서 화살표로 훑으면 언어마다 change 가 나서 언어 수만큼 외부 AI 를 부른다(R-P2 디바운스)
export const TR_LANG_SETTLE_MS = 400

// 번역 대기 중 표시(보강 r5 T08) — 새 자막이 오면 번역이 오는 1~2초 동안 원문(외국어)이 번쩍였다가 번역으로 바뀌었다(5초 조각마다).
//  대기 중엔 직전 번역을 그대로 두고(새 자막이 직전 번역을 받은 뒤 TR_HOLD_MS 안에 왔을 때만)(실시간 통역처럼 한 박자 늦게), 번역 실패·언어 바뀜·오래됨이면 원문.
//  key = '' 는 번역 안 함(꺼짐·같은 언어·서명 없음·중단). out = 마지막으로 받은 번역(key·언어·받은 시각), failKey = 실패한 key, capAt = 지금 자막을 받은 시각(렌더 중 Date.now 금지 — 순수)
export const TR_HOLD_MS = 8_000
export type TrOut = { key: string; text: string; lang: string; at: number }
export function shownOf(
  cap: { text: string; lang: string } | null,
  key: string,
  lang: string,
  out: TrOut | null,
  failKey: string,
  capAt: number,
): { text: string; lang: string } | null {
  if (!cap) return null
  if (key && out) {
    if (out.key === key) return { text: out.text, lang: out.lang }
    if (failKey !== key && out.lang === lang && capAt - out.at <= TR_HOLD_MS) return { text: out.text, lang: out.lang }
  }
  return { text: cap.text, lang: cap.lang }
}
