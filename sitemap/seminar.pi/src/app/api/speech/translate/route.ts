// 자막 문장 번역(SA8) — POST { smnId, text, lang } → { text }. 청중이 자막 시트에서 고른 언어로 자기 화면 자막만 번역한다(계획 A-3, piFetch).
// 순서 : 키 확인(없으면 503) → 세션·본문 병렬(R-P1) → 사용자당 분당 60회 → 캐시(문장 해시×언어) → 참가 자격(gate, 캐시 미스만) → 외부 AI 번역(10초, BUILD_DEFECTS 2.7)
// 캐시 적중은 자격 확인 없이 돌려준다 — 요청자가 보낸 문장의 번역이라 새어 나갈 데이터가 없고, 비용이 없다(같은 자막을 여러 청중이 동시에 요청 = DB 왕복 절약, R-P2)
// 동시에 같은 문장·언어 요청이 몰리면 진행 중 Promise 를 같이 기다린다(외부 AI 1회). 실패한 결과는 캐시에서 지운다. 비로그인 401(redirect 없음)
// ponytail: 캐시·요청 창 모두 서버 인스턴스 메모리 — 인스턴스가 여러 개면 인스턴스별(상한 = 인스턴스 수 × 60회). 정확한 전역 상한이 필요하면 DB 함수(fn_use_smn_vc 와 같은 방식)로
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { apiError, dbRoute, requireUser } from '@/lib/api'
import { closed, gate, noStore } from '@/lib/engage'
import { geminiEnabled, translate } from '@/lib/gemini'
import { isUuid } from '@/lib/seminar-rules'
import { cacheKey, cleanText, hitRate, isTranslateLang, Lru } from '@/lib/translate-rules'

const cache = new Lru<Promise<string | null>>(5_000) // 2,000자 상한 × 5,000 ≈ 최악 20MB, 실제 5초 자막은 100자 안팎
const rate = new Map<string, { start: number; n: number }>()

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    if (!geminiEnabled()) return apiError('AI_UNAVAILABLE', 503)
    const [user, body] = await Promise.all([requireUser(req), req.json().catch(() => null)])
    if (user instanceof NextResponse) return user
    const b = (body ?? {}) as { smnId?: unknown; text?: unknown; lang?: unknown }
    const text = cleanText(b.text)
    if (typeof b.smnId !== 'string' || !isUuid(b.smnId) || !text || !isTranslateLang(b.lang))
      return apiError('INVALID_INPUT', 400)
    const lang = b.lang
    if (!hitRate(rate, user.id, Date.now())) return apiError('SPEECH_RATE', 429)

    const key = await cacheKey(text, lang)
    let p = cache.get(key)
    if (!p) {
      const g = await gate(b.smnId.toLowerCase(), user)
      if (g instanceof NextResponse) return g
      if (!g.open) return closed()
      // 자격 확인을 기다리는 사이 같은 요청이 먼저 넣었을 수 있다
      p = cache.get(key) ?? translate(text, lang)
      cache.set(key, p)
    }
    const out = await p
    if (!out) {
      cache.delete(key)
      return apiError('TRANSLATE_FAILED', 502)
    }
    return NextResponse.json({ text: out }, { headers: noStore })
  }),
)
