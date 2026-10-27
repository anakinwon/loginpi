// 음성 번역 듣기(더빙, SA9) — POST JSON { smnId, text, lang } → 오디오 바이트(Content-Type = 합성 음성 MIME, 기본 audio/wav).
// text = 화면이 SA8 번역(/api/speech/translate, 같은 캐시)으로 이미 듣는 언어로 바꾼 자막 문장, lang = 듣는 언어(TRANSLATE_LANGS). 서버는 번역하지 않고 읽기만 한다 — 같은 문장 번역 2중 과금·직렬 지연 방지(A-3, R-P2·R-P4). 표준 합성 음성만(M-3 목소리 복제 없음).
// 순서 : 키 확인(없으면 503) → 세션·본문 병렬(R-P1) → 글자 300(TTS_MAX_CHARS) → 서버 발급 서명 확인(번역 결과·음성→글 결과만, 임의 글 403 — 보안 검토 D-2) → 사용자당 분당 30회(TTS_REQ_PER_MIN, hitRate)
//  → 자격 판정 1왕복을 오디오 내주기 전에 : 캐시 적중 = aiGate(개최자·ADMIN·활성 참가 + LIVE, 차감 없음) · 미스 = fn_use_smn_ai TTS(같은 판정 + 사용자 분당·세미나 누적 글자, sql/010)
//  → 외부 AI 10초(BUILD_DEFECTS 2.7) 실패 502 = 화면은 그 문장만 건너뜀. 적중을 무확인으로 내주면 비참가자·종료 세미나도 서명만으로 음성을 받는다(야간 시험 r2 T09 회귀)
// 자막 1문장은 청중 전원에게 동시에 방송된다 — 진행 중 Promise 를 캐시해 같은 문장·언어 요청이 몰려도 외부 합성 1회(계획 A-3). 실패 결과는 캐시에서 지운다. 비로그인 401(redirect 없음, piFetch)
// ponytail: 요청 창·캐시가 인스턴스 메모리 — 서버리스 인스턴스가 여러 개면 인스턴스마다 따로 센다. 정확한 전역 상한이 필요하면 DB 함수(fn_use_smn_vc 처럼)로
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { env } from '@/env'
import { apiError, db, dbFail, dbRoute, parseBody, requireUser } from '@/lib/api'
import { aiGate } from '@/lib/engage'
import { geminiEnabled, tts } from '@/lib/gemini'
import { isUuid } from '@/lib/seminar-rules'
import { TTS_MAX_CHARS, TTS_REQ_PER_MIN, vcUseError } from '@/lib/speech-rules'
import { AI_LIMIT, cacheKey, capSigOk, hitRate, isTranslateLang, Lru } from '@/lib/translate-rules'

const Body = z.object({
  smnId: z.string().refine(isUuid),
  text: z.string().trim().min(1).max(TTS_MAX_CHARS), // 합성 1문장 300자 — 임의 긴 글 합성 방지(비용 상한, D-2)
  lang: z.string().refine(isTranslateLang),
  sig: z.string().max(64), // 서버 발급 서명(/api/speech/translate 응답 sig 또는 자막 sig)
})

type ApiCode = Parameters<typeof apiError>[0]

type Audio = { data: Buffer; mime: string }
// 합성 음성 1문장 ≈ 5초 WAV 240KB, 100개 ≈ 24MB 상한
const cache = new Lru<Promise<Audio | null>>(100)
const rate = new Map<string, { start: number; n: number }>()

const synth = (text: string, lang: string) =>
  tts(text, lang).then((o) => (o ? { data: Buffer.from(o.data, 'base64'), mime: o.mime } : null))

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    if (!geminiEnabled()) return apiError('AI_UNAVAILABLE', 503)
    const [user, body] = await Promise.all([requireUser(req), parseBody(req, Body)])
    if (user instanceof NextResponse) return user
    if (body instanceof NextResponse) return body
    const smnId = body.smnId.toLowerCase()
    if (!(await capSigOk(env.PI_SESSION_SECRET, smnId, body.text, body.sig))) return apiError('FORBIDDEN', 403)
    if (!hitRate(rate, user.id, Date.now(), TTS_REQ_PER_MIN)) return apiError('SPEECH_RATE', 429)

    const key = await cacheKey(body.text, body.lang)
    let p = cache.get(key)
    if (p) {
      const denied = await aiGate(smnId, user)
      if (denied) return denied
    } else {
      const { data, error } = await db().rpc('fn_use_smn_ai', {
        p_smn_id: smnId,
        p_usr_id: user.id,
        p_kind: 'TTS',
        p_chr: body.text.length,
        p_max_chr: AI_LIMIT.TTS.maxChr,
        p_max_min_chr: AI_LIMIT.TTS.maxMinChr,
      })
      if (error) return dbFail(error)
      const e = vcUseError(data as string | null)
      if (e) return apiError(e.code as ApiCode, e.status)
      // 자격 확인을 기다리는 사이 같은 요청이 먼저 넣었을 수 있다
      p = cache.get(key) ?? synth(body.text, body.lang)
      cache.set(key, p)
    }
    const a = await p
    if (!a) {
      cache.delete(key)
      return apiError('SPEECH_TTS_FAILED', 502)
    }
    return new NextResponse(new Uint8Array(a.data), {
      headers: { 'Content-Type': a.mime, 'Cache-Control': 'no-store' },
    })
  }),
)
