// 음성 처리 순수 규칙 — 5초 음성 조각 검사(형식·크기·길이·독립 파일 머리), 사용 판정 결과 → apiError, 상한 계산, 합성 음성 속도 문구.
// 서버·클라이언트 공용(server-only 없음 — 화면도 같은 상수로 조각을 만든다). 시험 : node --test src/lib/speech-rules.test.mjs

// 조각 길이(계획 A-1 = 5초). 화면 녹음 오차를 감안해 0.5~10초 허용
export const CHUNK_MS = 5_000
export const CHUNK_MIN_MS = 500
export const CHUNK_MAX_MS = 10_000
// 조각 최대 크기 — 5초 opus ≈ 20~40KB, aac ≈ 40~80KB, 16kHz wav ≈ 160KB. 넉넉히 512KB(외부 AI 요청 한도 20MB 의 1/40)
export const MAX_CHUNK_BYTES = 512 * 1024
// 사용자당 분당 음성 조각 요청(계획 A-5) — 5초 조각이면 정상 12회
export const MAX_REQ_PER_MIN = 20
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
  'audio/wav': { ai: 'audio/wav', box: 'wav' },
}
type Box = 'webm' | 'ogg' | 'mp4' | 'wav'

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
  if (asc(b, 0, 'RIFF') && asc(b, 8, 'WAVE')) return 'wav'
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

// 상한(초) — env 값이 없거나 이상하면 기본 120분
export function speechMaxSec(envMin: number | undefined) {
  const m =
    Number.isInteger(envMin) && (envMin as number) >= 1
      ? (envMin as number)
      : SPEECH_MAX_MIN_DEFAULT
  return m * 60
}

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
