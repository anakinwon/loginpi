// 음성 처리 순수 규칙 — 5초 음성 조각 검사(형식·크기·길이·독립 파일 머리), 과금 초·정산, 사용 판정 결과 → apiError, 상한 계산, 합성 음성 속도 문구.
// 서버·클라이언트 공용(server-only 없음 — 화면도 같은 상수로 조각을 만든다). 시험 : node --test src/lib/speech-rules.test.mjs

// 조각 길이(계획 A-1 = 5초). 화면 녹음 오차를 감안해 0.5~10초 허용
export const CHUNK_MS = 5_000
export const CHUNK_MIN_MS = 500
export const CHUNK_MAX_MS = 10_000
// 과금 하한 비트레이트(바이트/초) = 128kbps — 화면 녹음(opus 32kbps·aac 64~128kbps)보다 넉넉한 상한.
//  보낸 바이트가 이 비트레이트로 신고 길이보다 길면 바이트 기준으로 과금(durMs 축소 신고 차단, billSec)
export const BILL_BYTES_PER_SEC = 16_000
// 조각 최대 크기 = 최대 길이 10초 × 128kbps = 160KB(5초 opus ≈ 20~40KB, aac ≈ 40~80KB). wav(16kHz mono 5초 ≈ 160KB)는 받지 않는다
export const MAX_CHUNK_BYTES = (CHUNK_MAX_MS / 1000) * BILL_BYTES_PER_SEC
// 사용자당 분당 음성 조각 요청(계획 A-5) — 5초 조각이면 정상 12회
export const MAX_REQ_PER_MIN = 20
// 사용자당 분당 음성 초 상한(fn_use_smn_vc RATE) — 실시간 60초 + 분 경계 오차 10초. 요청 수 상한만으론 20회×10초 = 실시간 3.3배까지 허용됨
export const MAX_SEC_PER_MIN = 70
// 외부 AI 음성 입력 토큰 = 초당 32(공식 문서 docs/audio 'each second of audio is represented as 32 tokens') — 호출 후 실제 길이로 정산
export const AUDIO_TOKENS_PER_SEC = 32
// 세미나(또는 대면 노트) 1건 음성 처리 상한 기본값(분) — env SPEECH_MAX_MIN 이 덮어쓴다
export const SPEECH_MAX_MIN_DEFAULT = 120
// 번역·합성 음성 입력 글자 상한(SA8·SA9 공용)
export const MAX_TEXT_CHARS = 2_000
// 동의 기록(smn_agr.agr_ver_cd)에 남길 처리방침 문안 버전 — /privacy 문안을 바꾸면 함께 올린다
export const PRIVACY_VER = '2026-10-27'

// 브라우저 MediaRecorder 형식 → 외부 AI 입력 MIME(공식 문서 2026-10-27 확인 : webm·ogg·m4a·wav 등 지원 — docs/audio)
// audio/mp4(Safari·iOS MediaRecorder) → audio/m4a 로 보낸다 [추론 : 목록에 mp4 없음, m4a = MP4 오디오 컨테이너 — 실기기 확인 필요]
const MIME: Record<string, { ai: string; box: Box }> = {
  'audio/webm': { ai: 'audio/webm', box: 'webm' },
  'audio/ogg': { ai: 'audio/ogg', box: 'ogg' },
  'audio/mp4': { ai: 'audio/m4a', box: 'mp4' },
}
type Box = 'webm' | 'ogg' | 'mp4'

// 'audio/webm;codecs=opus' → 'audio/webm'. 모르는 형식 = null
export function baseMime(type: string | null | undefined) {
  const t = (type ?? '').split(';')[0].trim().toLowerCase()
  return t in MIME ? t : null
}
export const aiMime = (type: string) => MIME[baseMime(type) ?? '']?.ai ?? null

const asc = (b: Uint8Array, at: number, s: string) =>
  b.length >= at + s.length &&
  [...s].every((c, i) => b[at + i] === c.charCodeAt(0))

// 파일 머리(매직 바이트)로 컨테이너 판별 — 조각이 '혼자 재생되는 파일'인지 확인
// REA 근거(REA_04 jitsi-04 설계 함의 A-1·aidb Q5) : MediaRecorder start(timeslice) 조각은 첫 조각에만 webm 머리(EBML 1A45DFA3)가 있다
//  → 5초마다 recorder 를 stop/start 해 조각마다 독립 파일로 만들어야 하고, 서버는 머리 없는 조각을 외부 AI 로 보내기 전에 거른다(비용 낭비 차단)
export function sniffBox(b: Uint8Array): Box | null {
  if (
    b.length >= 4 &&
    b[0] === 0x1a &&
    b[1] === 0x45 &&
    b[2] === 0xdf &&
    b[3] === 0xa3
  )
    return 'webm'
  if (asc(b, 0, 'OggS')) return 'ogg'
  if (asc(b, 4, 'ftyp')) return 'mp4'
  return null
}

// 조각 검사 — 문제 있으면 사유 문자열(서버 로그용), 통과 = null
export function chunkError(c: {
  type: string
  bytes: Uint8Array
  durMs: number
}) {
  const m = baseMime(c.type)
  if (!m) return 'mime'
  if (c.bytes.length < 1 || c.bytes.length > MAX_CHUNK_BYTES) return 'size'
  if (
    !Number.isInteger(c.durMs) ||
    c.durMs < CHUNK_MIN_MS ||
    c.durMs > CHUNK_MAX_MS
  )
    return 'duration'
  if (sniffBox(c.bytes) !== MIME[m].box) return 'header'
  return null
}

// 사용량에 올릴 초(올림) — 0.5초 조각도 1초
export const chunkSec = (durMs: number) => Math.ceil(durMs / 1000)
// 호출 전 과금 초 = max(신고 길이, 128kbps 로 본 최소 길이) — 512KB 를 0.5초로 신고하는 식의 축소 신고 차단
export const billSec = (durMs: number, bytes: number) =>
  Math.max(chunkSec(durMs), Math.ceil(bytes / BILL_BYTES_PER_SEC))
// 호출 후 정산 — 외부 AI 가 센 음성 토큰으로 본 실제 길이가 과금 초보다 길면 그 차이(초), 아니면 0
//  (128kbps 하한보다 낮은 비트레이트로 긴 오디오를 담은 경우 — 이 차이를 사용량에 더 올린다)
export function extraSec(billed: number, audioTokens: number | null) {
  if (!audioTokens || !Number.isFinite(audioTokens) || audioTokens <= 0)
    return 0
  return Math.max(0, Math.ceil(audioTokens / AUDIO_TOKENS_PER_SEC) - billed)
}

// 상한(초) — env 값이 없거나 이상하면 기본 120분
export function speechMaxSec(envMin: number | undefined) {
  const m =
    Number.isInteger(envMin) && (envMin as number) >= 1
      ? (envMin as number)
      : SPEECH_MAX_MIN_DEFAULT
  return m * 60
}
// 개최자·ADMIN 이 아닌 사용자(무대 승격 참가자) 1인 누적 상한 = 전체 상한의 1/4 — 청중 1명이 세미나 상한을 다 쓰지 못하게
export const usrMaxSec = (maxSec: number) => Math.floor(maxSec / 4)

// BCP-47 언어 코드(힌트·번역 대상) — 'ko'·'en'·'pt-BR'·'zh-Hant'
export const LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/

type Err = { code: string; status: number } | null

// fn_use_smn_vc 결과 → 오류(OK = 통과). NO_AGR 이면 화면이 동의 모달을 띄운다
export function vcUseError(rslt: string | null | undefined): Err {
  switch (rslt) {
    case 'OK':
      return null
    case 'INVALID':
      return { code: 'INVALID_INPUT', status: 400 }
    case 'NOT_FOUND':
      return { code: 'NOT_FOUND', status: 404 }
    case 'NOT_LIVE':
      return { code: 'SPEECH_NOT_LIVE', status: 409 }
    case 'FORBIDDEN':
      return { code: 'FORBIDDEN', status: 403 }
    case 'NO_AGR':
      return { code: 'SPEECH_NO_AGR', status: 403 }
    case 'RATE':
      return { code: 'SPEECH_RATE', status: 429 }
    case 'QUOTA':
      return { code: 'SPEECH_QUOTA', status: 429 }
    default:
      return { code: 'INTERNAL', status: 500 }
  }
}

// 합성 음성 속도 → 말하기 방식 문구(외부 AI 에 속도 숫자 인자가 없어 문구로 지시 — docs/speech-generation 2026-10-12).
// 정확한 길이 맞춤은 화면 재생 속도(playbackRate 0.8~1.5, SA9)가 맡고 이건 보조
export function paceStyle(rate: number) {
  if (!Number.isFinite(rate)) return null
  if (rate >= 1.15) return 'speaking quickly'
  if (rate <= 0.9) return 'speaking slowly'
  return null
}

// ── 음성 번역 듣기(더빙, SA9 — M-3 표준 합성 음성) ──
// 사용자당 분당 합성 음성 요청(캐시 적중 포함) — 발표자 1명 5초 조각이면 정상 12회, 패널 2명이 동시에 말해도 여유
export const TTS_REQ_PER_MIN = 30
// 재생 큐 — 재생 대기가 이만큼을 넘으면 가장 오래된 것을 버린다(늦은 더빙은 원음과 어긋나 쓸모없음)
export const DUB_QUEUE_MAX = 3
// 재생 속도 범위 — 원문 발화 시간에 맞추되 알아듣기 어려운 속도는 막는다
export const DUB_RATE_MIN = 0.8
export const DUB_RATE_MAX = 1.5
// 더빙을 켠 동안 원음 볼륨(설계서 15.4 — 20%)
export const DUB_DUCK = 0.2

// 분당 요청 창(슬라이딩 1분) — 통과면 기록하고 true. hits 는 호출부의 모듈 Map
export function rateOk(
  hits: Map<string, number[]>,
  key: string,
  now: number,
  max: number,
) {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000)
  const ok = recent.length < max
  if (ok) recent.push(now)
  if (recent.length) hits.set(key, recent)
  else hits.delete(key)
  return ok
}

// 재생 속도 = 합성 음성 길이 ÷ 원문 발화 길이, 0.8~1.5 로 묶음. 원문 길이 = 자막 1개 = 음성 조각 1개(CHUNK_MS)
// ponytail: 원문 길이를 조각 고정 길이로 봄 — 자막 메시지에 실제 durMs 가 실리면 그 값으로
export function dubRate(dubSec: number, srcMs = CHUNK_MS) {
  if (!Number.isFinite(dubSec) || dubSec <= 0 || srcMs <= 0) return 1
  return Math.min(
    DUB_RATE_MAX,
    Math.max(DUB_RATE_MIN, (dubSec * 1000) / srcMs),
  )
}

// 재생 큐에 넣기 — 넘치면 앞(오래된 것)부터 버린다. 버린 항목을 돌려줘 호출부가 정리(요청 취소 등)
export function pushDub<T>(q: readonly T[], item: T, max = DUB_QUEUE_MAX) {
  const next = [...q, item]
  const dropped = next.length > max ? next.splice(0, next.length - max) : []
  return { q: next, dropped }
}
