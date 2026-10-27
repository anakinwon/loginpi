// 음성 조각 → 글 — POST multipart/form-data { audio: 5초 독립 오디오 파일(webm/ogg/mp4 — wav 는 받지 않음), smnId 또는 ntId, durMs, lang? } → { text, lang, ts, sig }.
// sig = 세미나 자막 서명(translate-rules capSig, 대면 노트·빈 글·500자 초과는 null) — 자막 방송에 실어 번역·합성(/api/speech/translate·tts)이 서버가 만든 글만 받게(보안 검토 D-2)
// 말하는 사람 자기 브라우저가 자기 마이크 조각을 보낸다(계획 A-1, piFetch — Pi Browser 는 쿠키가 없어 X-Pi-Token). 비로그인 401(redirect 없음).
// 순서 : 키 확인(없으면 503, 화면 숨김) → 세션·본문 병렬(R-P1) → 조각 검사(형식·크기 160KB·길이·독립 파일 머리) → fn_use_smn_vc 1왕복
//  (권한·동의·분당 20회·분당 70초·참가자 1인 상한·누적 상한, 대상 행 잠금 R-P5) → 외부 AI 음성→글(10초, BUILD_DEFECTS 2.7) → 실패 502 = 화면은 그 조각 자막만 건너뜀
// 사용량 = opus 최저 6kbps 로 본 최악 길이를 판정 때 선예약(reserveSec, sql/010) → 호출 뒤 max(128kbps 하한 billSec, 외부 AI 음성 토큰 길이)로
//  정산(settleSec) — 남으면 fn_ref_smn_vc_sec 환급, 모자라면 fn_add_smn_vc_sec 추가. 동시 요청이 사후 정산 전에 상한을 넘기지 못한다(chunk 정산 경합, 신규 —
//  팀장 판정 D-2(translate·tts 무계량)·D-3(consent POST)은 이 파일 범위 밖, 담당 브랜치에서 처리)
// sql/010 미적용 DB(fn_ref_smn_vc_sec 없음) = 008 방식(128kbps 하한 billSec 예약 + fn_add 추가)으로 자동 후퇴 — 010 의 분당 판정 없이
//  큰 예약을 걸면 분당 조각 1개로 떨어지고 환급 실패로 사용량이 약 8배 쌓이기 때문(적용 순서 사고 방지)
// 회의록 저장 = 기록 시작자·개최자·ADMIN 의 조각만(canRecordSeg) — 무대 참가자 음성은 자막만(회의록 오염·프롬프트 주입 차단, D-1)
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { env } from '@/env'
import { apiError, db, dbFail, dbRoute } from '@/lib/api'
import { getSessionUser, isAdmin } from '@/lib/auth'
import { geminiEnabled, transcribe } from '@/lib/gemini'
import { canRecordSeg } from '@/lib/note-rules'
import { isUuid } from '@/lib/seminar-rules'
import { capSig } from '@/lib/translate-rules'
import {
  aiMime,
  billSec,
  chunkError,
  LANG_RE,
  MAX_CHUNK_BYTES,
  MAX_REQ_PER_MIN,
  MAX_SEC_PER_MIN,
  reserveSec,
  settleSec,
  speechMaxSec,
  usrMaxSec,
  vcUseError,
} from '@/lib/speech-rules'

type ApiCode = Parameters<typeof apiError>[0]
const noStore = { 'Cache-Control': 'no-store' }
const str = (v: FormDataEntryValue | null) =>
  typeof v === 'string' && v ? v : null

// sql/010 적용 여부 — fn_ref_smn_vc_sec 를 잘못된 인자(p_sec 0, 즉시 RETURN·부작용 없음)로 불러 본다.
//  적용됨은 인스턴스 동안 기억, 미적용·오류는 60초마다 다시 확인(R-P2). 오류도 미적용으로 본다(보수적 = 008 방식)
let refOk = false
let refAt = 0
async function vcRefReady() {
  if (refOk || Date.now() - refAt < 60_000) return refOk
  refAt = Date.now()
  const { error } = await db().rpc('fn_ref_smn_vc_sec', {
    p_smn_id: null,
    p_nt_id: null,
    p_usr_id: null,
    p_sec: 0,
  })
  if (error)
    console.warn('[speech/chunk] sql/010 미적용 — 008 방식 예약', error.code)
  refOk = !error
  return refOk
}

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    if (!geminiEnabled()) return apiError('AI_UNAVAILABLE', 503)
    const [user, form, refReady] = await Promise.all([
      getSessionUser(req),
      req.formData().catch(() => null),
      vcRefReady(),
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

    const target = {
      p_smn_id: smnId?.toLowerCase() ?? null,
      p_nt_id: ntId?.toLowerCase() ?? null,
      p_usr_id: user.id,
    }
    const sec = billSec(durMs, bytes.length)
    const held = refReady ? reserveSec(durMs, bytes.length) : sec
    const maxSec = speechMaxSec(env.SPEECH_MAX_MIN)
    const { data, error } = await db().rpc('fn_use_smn_vc', {
      ...target,
      p_sec: held,
      p_max_sec: maxSec,
      p_max_req: MAX_REQ_PER_MIN,
      p_max_min_sec: MAX_SEC_PER_MIN,
      p_max_usr_sec: usrMaxSec(maxSec),
    })
    if (error) return dbFail(error)
    const e = vcUseError(data as string | null)
    if (e) return apiError(e.code as ApiCode, e.status)

    // 조각 시작 시각(서버 추정) — 클라이언트 시계를 믿지 않는다
    const ts = Date.now() - durMs
    // 기록 중 회의록 찾기(AI 회의록 켜짐 = 세미나의 RECORDING 1건, 대면 노트 = ntId 자신)는 외부 AI 호출과 독립 — 병렬(R-P1)
    const ntQ = db()
      .from('smn_nt')
      .select('nt_id, usr_id, smn_mst(hst_usr_id)')
      .eq('nt_sts_cd', 'RECORDING')
      .eq('del_yn', 'N')
    const [r, nt] = await Promise.all([
      transcribe(
        Buffer.from(bytes).toString('base64'),
        aiMime(audio.type) as string,
        lang,
      ),
      (target.p_smn_id
        ? ntQ.eq('smn_id', target.p_smn_id)
        : ntQ.eq('nt_id', target.p_nt_id as string)
      )
        .limit(1)
        .maybeSingle<{
          nt_id: string
          usr_id: string
          smn_mst: { hst_usr_id: string } | null
        }>(),
    ])

    // 정산 — 선예약(held) vs 최종 과금. 호출 실패도 128kbps 하한까지 환급(외부 AI 장애 동안 예약이 상한을 갉아먹지 않게)
    const delta = settleSec(held, sec, r?.audioTokens)
    if (delta !== 0) {
      if (delta > 0)
        console.warn('[speech/chunk] 사용량 추가', user.id, sec, delta)
      const { error: e2 } = await db().rpc(
        delta > 0 ? 'fn_add_smn_vc_sec' : 'fn_ref_smn_vc_sec',
        { ...target, p_sec: Math.abs(delta) },
      )
      if (e2) console.error('[speech/chunk] 정산 실패', e2.code, e2.message)
    }
    if (!r) return apiError('SPEECH_FAILED', 502)

    // 회의록 조각 저장(SubAgent7) — 빈 글은 저장하지 않고, 저장이 실패해도 자막은 돌려준다(화자명 = 발화 시점 표시명 스냅샷)
    if (nt.error)
      console.error('[speech/chunk] 회의록 조회 실패', nt.error.code)
    if (
      nt.data &&
      r.text &&
      canRecordSeg({
        uid: user.id,
        starter: nt.data.usr_id,
        host: nt.data.smn_mst?.hst_usr_id,
        admin: isAdmin(user),
      })
    ) {
      const { error: e3 } = await db()
        .from('smn_nt_seg')
        .insert({
          nt_id: nt.data.nt_id,
          spk_usr_id: user.id,
          spk_nm: (user.display_name || user.pi_username || '').slice(0, 100),
          seg_cont: r.text,
          lang_cd: r.lang,
          seg_dtm: new Date(ts).toISOString(),
          regr_id: user.id,
          modr_id: user.id,
        })
      if (e3)
        console.error(
          '[speech/chunk] 회의록 조각 저장 실패',
          e3.code,
          e3.message,
        )
    }
    const sig = target.p_smn_id && r.text ? await capSig(env.PI_SESSION_SECRET, target.p_smn_id, r.text) : null
    return NextResponse.json(
      { text: r.text, lang: r.lang, ts, sig },
      { headers: noStore },
    )
  }),
  // 본문 상한 = 조각 상한 + multipart 머리 여유(기본 64KB 로는 5초 aac 가 413)
  { maxBodySize: MAX_CHUNK_BYTES + 16_384 },
)
