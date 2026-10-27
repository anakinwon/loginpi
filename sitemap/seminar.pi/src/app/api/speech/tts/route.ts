// 음성 번역 듣기(더빙, SA9) — POST JSON { smnId, text, lang } → 오디오 바이트(Content-Type = 합성 음성 MIME, 기본 audio/wav).
// text = 화면이 SA8 번역(/api/speech/translate, 같은 캐시)으로 이미 듣는 언어로 바꾼 자막 문장, lang = 듣는 언어(TRANSLATE_LANGS). 서버는 번역하지 않고 읽기만 한다 — 같은 문장 번역 2중 과금·직렬 지연 방지(A-3, R-P2·R-P4). 표준 합성 음성만(M-3 목소리 복제 없음).
// 순서 : 키 확인(없으면 503) → 세션·본문 병렬(R-P1) → 사용자당 분당 30회(TTS_REQ_PER_MIN) → LIVE 세미나의 개최자·참가 등록자 확인(통과 60초 캐시, R-P2)
//  → 합성 캐시(문장×언어, 계획 A-3 — 같은 문장은 1회만 과금) → 외부 AI 10초(BUILD_DEFECTS 2.7) 실패 502 = 화면은 그 문장만 건너뜀. 비로그인 401(redirect 없음, piFetch)
// ponytail: 요청 창·캐시·권한 캐시가 인스턴스 메모리 — 서버리스 인스턴스가 여러 개면 인스턴스마다 따로 센다. 정확한 전역 상한이 필요하면 DB 함수(fn_use_smn_vc 처럼)로
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import {
  apiError,
  db,
  dbFail,
  dbRoute,
  parseBody,
  requireUser,
} from '@/lib/api'
import { isAdmin } from '@/lib/auth'
import { geminiEnabled, tts } from '@/lib/gemini'
import { isUuid } from '@/lib/seminar-rules'
import { rateOk, TTS_REQ_PER_MIN } from '@/lib/speech-rules'
import { isTranslateLang } from '@/lib/translate-rules'
import { CAPTION } from '@/components/room/features/captions/caption-rules'

const Body = z.object({
  smnId: z.string().refine(isUuid),
  text: z.string().trim().min(1).max(CAPTION.maxChars), // 자막 표시 상한과 같게 — 임의 긴 글 합성 방지(비용 상한)
  lang: z.string().refine(isTranslateLang),
})

// ponytail: 삽입 순서 Map 을 LRU 로 — 합성 음성 1문장 ≈ 5초 WAV 240KB, 100개 ≈ 24MB 상한
const AUDIO_MAX = 100
const audioCache = new Map<string, { data: Buffer; mime: string }>()
function lru<V>(m: Map<string, V>, k: string, v?: V, max = 0) {
  if (v === undefined) {
    const hit = m.get(k)
    if (hit !== undefined) {
      m.delete(k)
      m.set(k, hit)
    }
    return hit
  }
  m.set(k, v)
  while (m.size > max) m.delete(m.keys().next().value as string)
  return v
}

const hits = new Map<string, number[]>()
const allowed = new Map<string, number>() // `${usr}:${smn}` → 만료 시각(통과만 캐시)
const ALLOW_MS = 60_000

async function canListen(usrId: string, smnId: string) {
  const k = `${usrId}:${smnId}`
  if ((allowed.get(k) ?? 0) > Date.now()) return null
  const [m, p] = await Promise.all([
    db()
      .from('smn_mst')
      .select('hst_usr_id, smn_sts_cd')
      .eq('smn_id', smnId)
      .eq('del_yn', 'N')
      .maybeSingle<{ hst_usr_id: string; smn_sts_cd: string }>(),
    db()
      .from('smn_ptc')
      .select('ptc_id')
      .eq('smn_id', smnId)
      .eq('usr_id', usrId)
      .eq('del_yn', 'N')
      .limit(1)
      .maybeSingle(),
  ])
  if (m.error) return dbFail(m.error)
  if (p.error) return dbFail(p.error)
  if (!m.data) return apiError('NOT_FOUND', 404)
  if (m.data.smn_sts_cd !== 'LIVE') return apiError('SPEECH_NOT_LIVE', 409)
  if (m.data.hst_usr_id !== usrId && !p.data) return apiError('FORBIDDEN', 403)
  allowed.set(k, Date.now() + ALLOW_MS)
  if (allowed.size > 5_000) allowed.clear() // 무한 증가 방지
  return null
}

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    if (!geminiEnabled()) return apiError('AI_UNAVAILABLE', 503)
    const [user, body] = await Promise.all([
      requireUser(req),
      parseBody(req, Body),
    ])
    if (user instanceof NextResponse) return user
    if (body instanceof NextResponse) return body
    if (!rateOk(hits, user.id, Date.now(), TTS_REQ_PER_MIN))
      return apiError('SPEECH_RATE', 429)
    const smnId = body.smnId.toLowerCase()
    if (!isAdmin(user)) {
      const deny = await canListen(user.id, smnId)
      if (deny) return deny
    }

    const ak = `${body.lang}\n${body.text}`
    let a = lru(audioCache, ak)
    if (!a) {
      const out = await tts(body.text, body.lang)
      if (!out) return apiError('SPEECH_TTS_FAILED', 502)
      a = { data: Buffer.from(out.data, 'base64'), mime: out.mime }
      lru(audioCache, ak, a, AUDIO_MAX)
    }
    return new NextResponse(new Uint8Array(a.data), {
      headers: { 'Content-Type': a.mime, 'Cache-Control': 'no-store' },
    })
  }),
)
