// 음성 조각 → 글 — POST multipart/form-data { audio: 5초 독립 오디오 파일(webm/ogg/mp4/wav), smnId 또는 ntId, durMs, lang? } → { text, lang, ts }.
// 말하는 사람 자기 브라우저가 자기 마이크 조각을 보낸다(계획 A-1, piFetch — Pi Browser 는 쿠키가 없어 X-Pi-Token). 비로그인 401(redirect 없음).
// 순서 : 키 확인(없으면 503, 화면 숨김) → 세션·본문 병렬(R-P1) → 조각 검사(형식·크기·길이·독립 파일 머리) → fn_use_smn_vc 1왕복
//  (권한·동의·분당 20회·누적 상한, 대상 행 잠금 R-P5) → 외부 AI 음성→글(10초, BUILD_DEFECTS 2.7) → 실패 502 = 화면은 그 조각 자막만 건너뜀
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { env } from '@/env'
import { apiError, db, dbFail, dbRoute } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { geminiEnabled, transcribe } from '@/lib/gemini'
import { isUuid } from '@/lib/seminar-rules'
import {
  aiMime,
  chunkError,
  chunkSec,
  LANG_RE,
  MAX_CHUNK_BYTES,
  MAX_REQ_PER_MIN,
  speechMaxSec,
  vcUseError,
} from '@/lib/speech-rules'

type ApiCode = Parameters<typeof apiError>[0]
const noStore = { 'Cache-Control': 'no-store' }
const str = (v: FormDataEntryValue | null) =>
  typeof v === 'string' && v ? v : null

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    if (!geminiEnabled()) return apiError('AI_UNAVAILABLE', 503)
    const [user, form] = await Promise.all([
      getSessionUser(req),
      req.formData().catch(() => null),
    ])
    if (!user) return apiError('AUTH_PI_REQUIRED', 401)
    if (!form) return apiError('BAD_REQUEST_BODY', 400)

    const audio = form.get('audio')
    const smnId = str(form.get('smnId'))
    const ntId = str(form.get('ntId'))
    const durMs = Number(form.get('durMs'))
    const lang = str(form.get('lang'))
    // 대상은 정확히 하나(세미나 또는 대면 노트), uuid 는 소문자로 통일(입장권 라우트와 같은 규칙)
    if (
      !(audio instanceof Blob) ||
      !!smnId === !!ntId ||
      !isUuid(smnId ?? ntId) ||
      (lang && !LANG_RE.test(lang))
    )
      return apiError('INVALID_INPUT', 400)
    const bytes = new Uint8Array(await audio.arrayBuffer())
    const bad = chunkError({ type: audio.type, bytes, durMs })
    if (bad) {
      console.warn(
        '[speech/chunk] 조각 거부',
        bad,
        audio.type,
        bytes.length,
        durMs,
      )
      return apiError('SPEECH_CHUNK_INVALID', 400)
    }

    const { data, error } = await db().rpc('fn_use_smn_vc', {
      p_smn_id: smnId?.toLowerCase() ?? null,
      p_nt_id: ntId?.toLowerCase() ?? null,
      p_usr_id: user.id,
      p_sec: chunkSec(durMs),
      p_max_sec: speechMaxSec(env.SPEECH_MAX_MIN),
      p_max_req: MAX_REQ_PER_MIN,
    })
    if (error) return dbFail(error)
    const e = vcUseError(data as string | null)
    if (e) return apiError(e.code as ApiCode, e.status)

    // 조각 시작 시각(서버 추정) — 클라이언트 시계를 믿지 않는다
    const ts = Date.now() - durMs
    const r = await transcribe(
      Buffer.from(bytes).toString('base64'),
      aiMime(audio.type) as string,
      lang,
    )
    if (!r) return apiError('SPEECH_FAILED', 502)

    // 회의록(AI 회의록 켜짐) 조각 저장 = SubAgent7 이 이 자리에 붙인다 :
    //  smn_nt_seg INSERT { nt_id, spk_usr_id: user.id, spk_nm: user.display_name || user.pi_username, seg_cont: r.text, lang_cd: r.lang, seg_dtm: ts }
    //  (빈 text 는 저장하지 않음, 응답을 늦추지 않게 실패해도 자막은 돌려준다)
    return NextResponse.json(
      { text: r.text, lang: r.lang, ts },
      { headers: noStore },
    )
  }),
  // 본문 상한 = 조각 상한 + multipart 머리 여유(기본 64KB 로는 5초 aac·wav 가 413)
  { maxBodySize: MAX_CHUNK_BYTES + 16_384 },
)
