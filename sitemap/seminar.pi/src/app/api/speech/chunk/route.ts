// 음성 조각 → 글 — POST multipart/form-data { audio: 3초(CHUNK_MS) 독립 오디오 파일(webm/ogg/mp4 — wav 는 받지 않음), smnId 또는 ntId, durMs, lang? } → { text, lang, ts, sig, rec? }.
// rec = (세미나 조각만) 기록 중 AI 회의록이 있는가 — 발표자 화면의 회의록 종료·삭제 감지(note-rules noteGone)
// sig = 세미나 자막 서명(translate-rules capSig, 대면 노트·빈 글·500자 초과는 null) — 자막 방송에 실어 번역·합성(/api/speech/translate·tts)이 서버가 만든 글만 받게(보안 검토 D-2)
// 말하는 사람 자기 브라우저가 자기 마이크 조각을 보낸다(계획 A-1, piFetch — Pi Browser 는 쿠키가 없어 X-Pi-Token). 비로그인 401(redirect 없음).
// 순서 : 키 확인(없으면 503, 화면 숨김) → 세션·본문 병렬(R-P1) → 조각 검사(형식·크기 160KB·길이·독립 파일 머리) → speechGate VC(fn_use_smn_vc 1왕복)
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
import { apiError, db, dbRoute } from '@/lib/api'
import { getSessionUser, isAdmin } from '@/lib/auth'
import { geminiEnabled, transcribe } from '@/lib/gemini'
import { canRecordSeg } from '@/lib/note-rules'
import { isUuid } from '@/lib/seminar-rules'
import { capSig, isTranslateLang, sameLang, TR_LANG_ACTIVE_MS, TR_LANG_MAX, trUse } from '@/lib/translate-rules'
import { speechGate, stageGate } from '@/lib/speech-gate'
import {
  aiMime,
  billSec,
  chunkError,
  LANG_RE,
  MAX_CHUNK_BYTES,
  NOTE_CTX,
  reserveSec,
  settleSec,
} from '@/lib/speech-rules'

const noStore = { 'Cache-Control': 'no-store' }
const str = (v: FormDataEntryValue | null) =>
  typeof v === 'string' && v ? v : null

// sql/010 적용 여부 — fn_ref_smn_vc_sec 를 잘못된 인자(p_sec 0, 즉시 RETURN·부작용 없음)로 불러 본다.
//  적용됨은 인스턴스 동안 기억, 미적용은 60초마다 다시 확인(R-P2).
//  '함수 없음'(PGRST202·42883)만 미적용으로 본다 — 일시 DB 오류로 작은 선과금(008 방식)에 떨어지면 상한이 느슨해진다(fail-open, 보안 검토 2026-10-28).
//  그 밖의 오류는 큰 예약(reserveSec) 유지 = 과금 쪽으로 닫힘, 기억하지 않고 다음 요청에 다시 확인
const FN_MISSING = new Set(['PGRST202', '42883'])
let refOk = false
let refAt = 0
async function vcRefReady() {
  if (refOk || Date.now() - refAt < 60_000) return refOk
  const { error } = await db().rpc('fn_ref_smn_vc_sec', {
    p_smn_id: null,
    p_nt_id: null,
    p_usr_id: null,
    p_sec: 0,
  })
  if (error && !FN_MISSING.has(error.code)) {
    console.warn('[speech/chunk] sql/010 확인 실패 — 큰 예약 유지', error.code)
    return true
  }
  refAt = Date.now()
  if (error) console.warn('[speech/chunk] sql/010 미적용 — 008 방식 예약', error.code)
  refOk = !error
  return refOk
}

// 서버 선번역 대상 언어(마스터 A안 2026-10-31) — 청중 화면이 /api/speech/lang 으로 남긴 언어 중 최근 TR_LANG_ACTIVE_MS 안 최대 TR_LANG_MAX 개.
//  조각마다(분당 20회) 같은 조회라 인스턴스 메모리에 15초 캐시(R-P2). 실패·sql/026 미적용(42P01) = [] → 선번역 없음(청중 화면이 이전처럼 직접 번역, fail-open)
const LANG_CACHE_MS = 15_000
// 선번역 계량(TRANS)이 거절되면(말한 사람 상한·무료 요금제) 이 시간 동안 선번역을 쉰다 — 거절은 외부 AI 호출 뒤에 알 수 있어, 쉬지 않으면 조각마다 번역 비용만 나간다
const TR_DENY_PAUSE_MS = 5 * 60_000
const langCache = new Map<string, { until: number; langs: string[] }>()
async function activeLangs(smnId: string): Promise<string[]> {
  const hit = langCache.get(smnId)
  if (hit && Date.now() < hit.until) return hit.langs
  const { data, error } = await db()
    .from('smn_trans_lang')
    .select('lang_cd')
    .eq('smn_id', smnId)
    .eq('del_yn', 'N')
    .gte('lst_req_dtm', new Date(Date.now() - TR_LANG_ACTIVE_MS).toISOString())
    .order('lst_req_dtm', { ascending: false })
    .limit(TR_LANG_MAX)
  if (error && error.code !== '42P01' && error.code !== 'PGRST205') console.warn('[speech/chunk] 선번역 언어 조회 실패', error.code)
  const langs = (data ?? []).map((r) => r.lang_cd as string).filter(isTranslateLang)
  langCache.set(smnId, { until: Date.now() + LANG_CACHE_MS, langs })
  if (langCache.size > 500) langCache.clear() // ponytail: 상한만 — 세미나 수백 개 동시는 아직 없음
  return langs
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
    // 대면 노트 전사 문맥(제목·직전 2문장) — 노트만 받고 길이로 자른다. 프롬프트에선 자료로만 다룬다(gemini transcribe)
    const ctx = ntId
      ? {
          title: str(form.get('ctxTitle'))?.slice(0, NOTE_CTX.title),
          prev: str(form.get('ctxPrev'))?.slice(-NOTE_CTX.prev),
        }
      : undefined
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
    // 무대 확인(D-1, 세미나만 — 대면 노트는 본인 노트) → 자격·동의·계량 = 공용 관문(speechGate, 번역·합성과 한 곳).
    //  무대가 먼저 — 청중 요청이 DB 예약(행 잠금)까지 가지 않게
    const offStage = target.p_smn_id ? await stageGate(target.p_smn_id, user) : null
    if (offStage) return offStage
    // 계량 판정과 선번역 언어 조회는 서로 안 쓰는 값 — 병렬(R-P1). 대면 노트는 선번역 없음
    const [denied, targets] = await Promise.all([
      speechGate({ smnId: target.p_smn_id, ntId: target.p_nt_id }, user, 'VC', held),
      target.p_smn_id ? activeLangs(target.p_smn_id) : Promise.resolve([] as string[]),
    ])
    if (denied) return denied

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
        ctx,
        targets,
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
    // rec = 이 세미나에 기록 중 회의록이 있는가(세미나 조각, 조회 성공일 때만) — 발표자 화면이 삭제·다른 곳 종료를 알아
    //  'AI 기록 중' 배지와 회의록용 음성 조각을 내린다(noteGone, 삭제 뒤에도 외부 AI 사용량이 계속 들던 문제)
    const rec = target.p_smn_id && !nt.error ? !!nt.data : undefined
    // 선번역(마스터 A안) — 말한 언어와 같은 대상은 뺀다. 번역 글자는 **말한 사람**(개최자·패널) 몫으로 계량(speechGate TRANS — 사용자·세미나 상한). 거절이면 선번역만 빼고
    //  자막은 그대로(청중 화면이 이전처럼 자기 요청으로 번역). 언어별 서명 = trUse(lang) — /api/speech/tts 가 그 언어 더빙에만 받는다(감사 High 1 과 같은 용도 분리)
    let tr: Record<string, string> | undefined
    let trSig: Record<string, string> | undefined
    if (target.p_smn_id && sig && r.tr) {
      const got = Object.entries(r.tr).filter(([k]) => !sameLang(k, r.lang ?? lang ?? ''))
      const chars = got.reduce((n, [, v]) => n + v.length, 0)
      if (got.length && chars) {
        const smn = target.p_smn_id
        // 사용자 개인 상한은 보지 않는다(usrCap false — 청중 전원 몫을 말한 사람이 대신 지므로), 세미나 누적·분당 상한만
        if (await speechGate({ smnId: smn }, user, 'TRANS', chars, { usrCap: false })) {
          // 거절(상한·무료 요금제) — 비용은 이미 1번 나갔다. 5분간 선번역을 쉬어 조각마다 되풀이되지 않게(청중 화면은 자기 요청 번역으로 후퇴)
          langCache.set(smn, { until: Date.now() + TR_DENY_PAUSE_MS, langs: [] })
        } else {
          const signed = await Promise.all(got.map(async ([k, v]) => [k, v, await capSig(env.PI_SESSION_SECRET, smn, v, trUse(k))] as const))
          tr = Object.fromEntries(signed.map(([k, v]) => [k, v]))
          trSig = Object.fromEntries(signed.flatMap(([k, , s]) => (s ? [[k, s]] : [])))
        }
      }
    }
    return NextResponse.json(
      { text: r.text, lang: r.lang, ts, sig, rec, ...(tr ? { tr, trSig } : {}) },
      { headers: noStore },
    )
  }),
  // 본문 상한 = 조각 상한 + multipart 머리 여유(기본 64KB 로는 5초 aac 가 413)
  { maxBodySize: MAX_CHUNK_BYTES + 16_384 },
)
