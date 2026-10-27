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
export const PRIVACY_VER = '2026-10-28' // 10-28 : 출석 기록(Pi 사용자명 개최자 제공) 고지 추가

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
  return Object.hasOwn(MIME, t) ? t : null // 자기 속성만('constructor'·'__proto__' 는 모르는 형식)
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
// 선예약 하한 비트레이트(바이트/초) = opus 최저 6kbps — 같은 바이트에 담길 수 있는 가장 긴 오디오(160KB ≈ 213초).
//  판정(fn_use_smn_vc) 때 이 최악 길이를 예약하고 호출 뒤 실제 길이로 환급(fn_ref_smn_vc_sec) — 동시 요청이 사후 정산 전에 상한을 넘기지 못하게
export const RESERVE_BYTES_PER_SEC = 750
export const reserveSec = (durMs: number, bytes: number) =>
  Math.max(billSec(durMs, bytes), Math.ceil(bytes / RESERVE_BYTES_PER_SEC))
// 호출 뒤 정산(초, 부호 있음) — 최종 과금 = max(과금 초, 외부 AI 음성 토큰으로 본 실제 길이). 음수 = 환급, 양수 = 추가(6kbps 보다 낮은 비트레이트)
//  호출 실패·토큰 없음 = 과금 초(128kbps 하한)까지 환급 — 외부 AI 장애 동안 예약이 상한을 갉아먹지 않게
export function settleSec(
  reserved: number,
  billed: number,
  audioTokens: number | null | undefined,
) {
  const real =
    audioTokens && Number.isFinite(audioTokens) && audioTokens > 0
      ? Math.ceil(audioTokens / AUDIO_TOKENS_PER_SEC)
      : 0
  return Math.max(billed, real) - reserved
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

// 음성 조각 거절 코드 → 이번 켜기를 멈출 이유(null = 그 조각만 건너뛰고 계속). 화면(use-speech)이 쓴다.
//  quota = 한도 소진 · live = 진행 중 아님(세미나 끝·노트가 다른 곳에서 끝남) · agr = 동의 없음 · gone = 대상 삭제(NOT_FOUND)·권한 잃음(FORBIDDEN).
//  gone 을 건너뛰기로 두면 노트가 지워진 뒤에도 5초마다 거절 요청을 끝없이 보내고 화면은 '기록 중'으로 남았다(T02 r3)
export type SpeechHalt = 'quota' | 'live' | 'agr' | 'gone'
export function speechHalt(code: string | null | undefined): SpeechHalt | null {
  switch (code) {
    case 'SPEECH_QUOTA':
      return 'quota'
    case 'SPEECH_NOT_LIVE':
      return 'live'
    case 'SPEECH_NO_AGR':
      return 'agr'
    case 'NOT_FOUND':
    case 'FORBIDDEN':
      return 'gone'
    default:
      return null
  }
}

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

// 엔진 관리 API 주소 — 시그널링 ws(s) 주소와 같은 호스트·포트(엔진은 /signal·/admin/ 를 한 mux 에 둔다). 잘못된 주소면 null
export function engineAdminBase(wsUrl: string | null | undefined): string | null {
  if (!wsUrl || !/^wss?:\/\//i.test(wsUrl)) return null
  try {
    return new URL(wsUrl.replace(/^ws/i, 'http')).origin
  } catch {
    return null
  }
}

// 무대 판정(D-1) — 엔진 조회 결과(null = 방에 접속 안 함) → 외부 AI 음성(chunk) 허용. 화면 speechOn 과 같은 규칙 :
//  presenter 는 늘, panel 은 발표자가 방에 있을 때만, audience·미접속은 거절
export type StageInfo = { role?: string; presenter?: boolean } | null
export const stageAllowed = (i: StageInfo) =>
  !!i && (i.role === 'presenter' || (i.role === 'panel' && i.presenter === true))

// 합성 음성 속도 → 말하기 방식 문구(외부 AI 에 속도 숫자 인자가 없어 문구로 지시 — docs/speech-generation 2026-10-12).
// 정확한 길이 맞춤은 화면 재생 속도(playbackRate 0.8~1.5, SA9)가 맡고 이건 보조
export function paceStyle(rate: number) {
  if (!Number.isFinite(rate)) return null
  if (rate >= 1.15) return 'speaking quickly'
  if (rate <= 0.9) return 'speaking slowly'
  return null
}

// ── 음성 번역 듣기(더빙, SA9 — M-3 표준 합성 음성) ──
// 사용자당 분당 합성 음성 요청(캐시 적중 포함, translate-rules hitRate 로 셈) — 발표자 1명 5초 조각이면 정상 12회, 패널 2명이 동시에 말해도 여유
export const TTS_REQ_PER_MIN = 30
// 합성 1문장 글자 상한 — 5초 자막 번역은 100자 안팎, 넘는 문장은 화면이 요청하지 않고 건너뜀(비용 상한, 보안 검토 D-2)
export const TTS_MAX_CHARS = 300
// 합성 응답이 이 상태면 이후 문장도 모두 실패한다 — 더빙을 끄고 알린다(문장마다 헛요청 반복 방지).
//  401 로그아웃 · 403 자격 없음 · 409 LIVE 아님 · 503 AI 꺼짐 · 429 중 세미나 한도 소진(SPEECH_QUOTA). 분당 횟수(SPEECH_RATE)·502 는 그 문장만 건너뜀
export const dubStop = (status: number, code?: unknown) =>
  status === 401 || status === 403 || status === 409 || status === 503 || (status === 429 && code === 'SPEECH_QUOTA')
// 재생 큐 — 재생 대기가 이만큼을 넘으면 가장 오래된 것을 버린다(늦은 더빙은 원음과 어긋나 쓸모없음)
export const DUB_QUEUE_MAX = 3
// 재생 속도 범위 — 원문 발화 시간에 맞추되 알아듣기 어려운 속도는 막는다
export const DUB_RATE_MIN = 0.8
export const DUB_RATE_MAX = 1.5
// 늦은 더빙 버리기(보강 r3 T09) — 자막을 받은 뒤 이 시간이 지나도록 재생을 시작 못 한 문장은 버린다.
//  합성·앞 문장 재생이 밀려 원음보다 한참 늦게 읽히는 것 방지(큐 3개 상한만으로는 합성 지연이 길 때 15초 넘게 밀린다)
export const DUB_STALE_MS = 15_000
export const dubStale = (at: number, now: number) => now - at > DUB_STALE_MS
// 연속 재생 실패 상한(보강 r4 T09) — 합성 음성을 이만큼 연달아 못 틀면(형식 미지원·자동재생 잠김) 더빙을 끄고 '다시 켜 주세요' 알림
export const DUB_FAIL_MAX = 3
// 더빙을 켠 동안 원음 볼륨(설계서 15.4 — 20%)
export const DUB_DUCK = 0.2
// 원음 볼륨 — 더빙이 켜져 있고 방 자막이 돌 때만 줄인다. 방 자막이 꺼져 있으면(발표자가 아직 안 켬·끔·한도·발표자 퇴장) 더빙할 문장이 오지 않으니
//  스위치는 켠 채로 원음 100%(야간 시험 r5 T09 — 켜 두면 아무 소리도 없이 원음만 20% 로 줄어 있었다). 방 자막이 다시 켜지면 그대로 이어진다
export const dubVolume = (on: boolean, room: boolean) => (on && room ? DUB_DUCK : 1)

// 한 번만 실행 — 재생 끝(onended·onerror·play() 거부)이 한 문장에 겹쳐 와도 다음 문장으로 1번만 넘어가게
export function once<A extends unknown[]>(f: (...a: A) => void) {
  let fin = false
  return (...a: A) => {
    if (fin) return
    fin = true
    f(...a)
  }
}

// 재생 속도 = 합성 음성 길이 ÷ 원문 발화 길이, 0.8~1.5 로 묶음. 원문 길이 = 자막 1개 = 음성 조각 1개(CHUNK_MS)
// ponytail: 원문 길이를 조각 고정 길이로 봄 — 자막 메시지에 실제 durMs 가 실리면 그 값으로
export function dubRate(dubSec: number, srcMs = CHUNK_MS) {
  if (!Number.isFinite(dubSec) || dubSec <= 0 || srcMs <= 0) return 1
  return Math.min(DUB_RATE_MAX, Math.max(DUB_RATE_MIN, (dubSec * 1000) / srcMs))
}

// 재생 큐에 넣기 — 넘치면 앞(오래된 것)부터 버린다. 버린 항목을 돌려줘 호출부가 정리(요청 취소 등)
export function pushDub<T>(q: readonly T[], item: T, max = DUB_QUEUE_MAX) {
  const next = [...q, item]
  const dropped = next.length > max ? next.splice(0, next.length - max) : []
  return { q: next, dropped }
}

// 진행 중 조각 업로드를 끝까지 기다리되 상한을 둔다 — 대면 노트 [종료] 가 마지막 말까지 회의록에 넣고 요약을 시작하게(useSpeech flush).
//  모두 끝나면 true, 상한이 먼저 오면 false(호출부는 그래도 끝내기를 진행 — 기다림이 종료를 막지 않는다)
export async function settleWithin(
  ps: Iterable<Promise<unknown>>,
  maxMs: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<boolean>((r) => {
    timer = setTimeout(r, maxMs, false)
  })
  const all = Promise.allSettled([...ps]).then(() => true)
  try {
    return await Promise.race([all, late])
  } finally {
    clearTimeout(timer)
  }
}

// 자막 방송 순서 — 조각 업로드는 겹친다(외부 AI 지연이 5초를 넘으면 뒤 조각 응답이 먼저 온다). 앞서 보낸 자막보다 오래된 조각(ts 작음)이면
//  false = 방송·화면 표시를 건너뛴다(최신 자막이 옛 문장으로 덮이고 더빙이 거꾸로 읽던 결함, T03 r2). 글로만 받는 대면 노트는 이 판정을 쓰지 않는다
export const captionFresh = (lastTs: number, ts: number) => ts >= lastTs

// 무음 조각 거르기(비용 절감, T03 r2) — 마이크가 켜진 채 아무도 말하지 않는 5초 조각을 외부 AI 로 보내지 않는다.
//  level = 조각 동안 시간 영역 RMS 최대값 기준. 말하기 링(SPEAK.level 0.04)보다 낮게 잡아 작은 목소리는 보낸다 [확인중 : 마스터 실기기 — 마이크·AGC 마다 다름]
//  minSamples = 측정 표본이 이보다 적으면(AudioContext 가 suspended·미지원 — Pi Browser 자동재생 정책 등) 판정하지 않고 보낸다(fail-open, 자막이 끊기지 않게)
export const VAD = { level: 0.01, pollMs: 100, minSamples: 10 }
export const chunkHeard = (peak: number, samples: number) => samples < VAD.minSamples || peak >= VAD.level
