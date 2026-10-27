// 음성 번역 듣기(더빙, SA9) — POST JSON { smnId, text, lang, sig } → 오디오 바이트(Content-Type = 합성 음성 MIME, 기본 audio/wav).
// text = /api/speech/translate 가 돌려준 번역문, sig = 그 번역문에 서버가 붙인 서명(caption-sig — 세미나·언어·문장·만료). 서버가 발급한 자막만 합성한다(보안 검토 D-2 : 임의 글 AI 대행 차단).
//  서버는 번역하지 않고 읽기만 한다 — 같은 문장 번역 2중 과금·직렬 지연 방지(A-3, R-P2·R-P4). 표준 합성 음성만(M-3 목소리 복제 없음).
// 순서 : 키 확인(없으면 503) → 세션·본문 병렬(R-P1) → 사용자당 분당 30회(TTS_REQ_PER_MIN) → 서명 확인(DB 없음, 403)
//  → fn_use_smn_tts 1왕복 = LIVE·참가 자격(gate 규칙) + 캐시 미스면 글자 수를 세미나·사용자 누적 상한에 차감 — 캐시 조회보다 '앞'(적중이어도 무권한 통과 없음)
//  → 캐시(문장 해시×언어) → 외부 AI 10초(BUILD_DEFECTS 2.7) 실패 502 = 화면은 그 문장만 건너뜀
// 자막 1문장은 청중 전원에게 동시에 방송된다 — 진행 중 Promise 를 캐시해 같은 문장·언어 요청이 몰려도 외부 합성 1회(계획 A-3). 실패 결과는 캐시에서 지운다. 비로그인 401(redirect 없음, piFetch)
// ponytail: 요청 창·캐시가 인스턴스 메모리 — 인스턴스마다 따로 센다(글자 누적 상한은 DB 라 전역). 미스 판정은 DB 왕복 전이라 동시 미스 2건이면 2번 차감, 외부 합성 실패(502)여도 차감 그대로(환급 없음 — 한도가 일찍 닳는 쪽 = 비용 안전). 정확도가 필요해지면 실패 시 환급 RPC
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { env } from '@/env'
import { apiError, db, dbFail, dbRoute, parseBody, requireUser } from '@/lib/api'
import { verifyCaption } from '@/lib/caption-sig'
import { geminiEnabled, tts } from '@/lib/gemini'
import { isUuid } from '@/lib/seminar-rules'
import { TTS_MAX_CHARS, TTS_REQ_PER_MIN, TTS_SMN_MAX_CHR, TTS_USR_MAX_CHR, ttsUseError } from '@/lib/speech-rules'
import { cacheKey, hitRate, isTranslateLang, Lru } from '@/lib/translate-rules'

type ApiCode = Parameters<typeof apiError>[0]

const Body = z.object({
  smnId: z.string().refine(isUuid),
  text: z.string().trim().min(1).max(TTS_MAX_CHARS), // 1문장 상한(D-2 비용 상한)
  lang: z.string().refine(isTranslateLang),
  sig: z.string().max(64),
})

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
    if (!hitRate(rate, user.id, Date.now(), TTS_REQ_PER_MIN)) return apiError('SPEECH_RATE', 429)
    const smnId = body.smnId.toLowerCase()
    if (!verifyCaption(env.PI_SESSION_SECRET, body.sig, { smnId, lang: body.lang, text: body.text }))
      return apiError('FORBIDDEN', 403)

    const key = await cacheKey(body.text, body.lang)
    const miss = !cache.get(key)
    const { data, error } = await db().rpc('fn_use_smn_tts', {
      p_smn_id: smnId,
      p_usr_id: user.id,
      p_chr: miss ? body.text.length : 0,
      p_max_chr: TTS_SMN_MAX_CHR,
      p_max_usr_chr: TTS_USR_MAX_CHR,
    })
    if (error) return dbFail(error)
    const e = ttsUseError(data as string | null)
    if (e) return apiError(e.code as ApiCode, e.status)

    // 판정을 기다리는 사이 같은 요청이 먼저 넣었을 수 있다
    let p = cache.get(key)
    if (!p) {
      p = synth(body.text, body.lang)
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
