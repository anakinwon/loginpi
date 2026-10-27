// 자막 문장 번역(SA8) — POST { smnId, text, lang, sig } → { text, sig }. 청중이 자막 시트에서 고른 언어로 자기 화면 자막만 번역한다(계획 A-3, piFetch).
// 순서 : 키 확인(없으면 503) → 세션·본문 병렬(R-P1) → 글자 상한 500 → 서버 발급 서명 확인(음성→글 결과만, 임의 글 403 — 보안 검토 D-2) → 사용자당 분당 60회
//  → 캐시(문장 해시×언어) → 자격 1왕복 : 적중 = aiGate(개최자·ADMIN·활성 참가 + LIVE, 차감 없음) · 미스 = fn_use_smn_ai(같은 판정 + 사용자 분당·세미나 누적 글자, sql/010) → 외부 AI 번역(10초, BUILD_DEFECTS 2.7)
// 캐시 적중도 자격을 본다 — 적중이 무확인이면 비참가자·종료 세미나가 서명만으로 번역과 새 서명(→ 더빙 합성)을 받는다(야간 시험 r2 T09, tts 와 형제)
// 응답 sig = 번역 결과 서명 — 더빙(/api/speech/tts)이 서버가 만든 번역만 읽게. 동시 같은 요청은 진행 중 Promise 공유(외부 AI 1회), 실패는 캐시에서 지운다. 비로그인 401(redirect 없음)
// ponytail: 캐시·요청 창은 인스턴스 메모리 — 정확한 전역 상한은 DB(fn_use_smn_ai)가 맡는다
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { env } from '@/env'
import { apiError, dbRoute, requireUser } from '@/lib/api'
import { aiGate, noStore } from '@/lib/engage'
import { geminiEnabled, translate } from '@/lib/gemini'
import { isUuid } from '@/lib/seminar-rules'
import { speechGate } from '@/lib/speech-gate'
import { cacheKey, capSig, capSigOk, cleanText, hitRate, isTranslateLang, Lru } from '@/lib/translate-rules'

const cache = new Lru<Promise<string | null>>(5_000) // 500자 상한 × 5,000 ≈ 최악 5MB, 실제 5초 자막은 100자 안팎
const rate = new Map<string, { start: number; n: number }>()

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    if (!geminiEnabled()) return apiError('AI_UNAVAILABLE', 503)
    const [user, body] = await Promise.all([requireUser(req), req.json().catch(() => null)])
    if (user instanceof NextResponse) return user
    const b = (body ?? {}) as { smnId?: unknown; text?: unknown; lang?: unknown; sig?: unknown }
    const text = cleanText(b.text)
    if (typeof b.smnId !== 'string' || !isUuid(b.smnId) || !text || !isTranslateLang(b.lang))
      return apiError('INVALID_INPUT', 400)
    const smnId = b.smnId.toLowerCase()
    const lang = b.lang
    if (!(await capSigOk(env.PI_SESSION_SECRET, smnId, text, b.sig))) return apiError('FORBIDDEN', 403)
    if (!hitRate(rate, user.id, Date.now())) return apiError('SPEECH_RATE', 429)

    const key = await cacheKey(text, lang)
    let p = cache.get(key)
    if (p) {
      // 캐시 적중도 자격(참가·LIVE) 확인 — 계량은 하지 않는다(D-2 회귀, T09)
      const denied = await aiGate(smnId, user)
      if (denied) return denied
    } else {
      const denied = await speechGate({ smnId }, user, 'TRANS', text.length)
      if (denied) return denied
      // 판정을 기다리는 사이 같은 요청이 먼저 넣었을 수 있다(그 몫도 계량 — 보수적)
      p = cache.get(key) ?? translate(text, lang)
      cache.set(key, p)
    }
    const out = await p
    if (!out) {
      cache.delete(key)
      return apiError('TRANSLATE_FAILED', 502)
    }
    return NextResponse.json({ text: out, sig: await capSig(env.PI_SESSION_SECRET, smnId, out) }, { headers: noStore })
  }),
)
