// AI 회의록(SubAgent7) 순수 규칙 — 화면 캡처 판정(64px 축소 프레임 차이·분당 2장)·state 신호 해석·Markdown 만들기·회의록 링크.
// 서버·화면·시험이 같이 쓴다(외부 의존 없음). 시험 : node --test src/lib/note-rules.test.mjs

// 캡처 판정 — 1초마다 화면공유를 64×36 으로 줄여 마지막 캡처와 비교
export const SHOT_W = 64
export const SHOT_H = 36
export const SHOT_TICK_MS = 1000
// 평균 밝기 차이(0~255) 문턱 — 슬라이드 넘김은 보통 20 이상, 커서·작은 애니메이션은 5 이하
// ponytail: 고정 문턱 1개(보정 손잡이), 실측 후 조정 — 영상 재생 화면은 분당 상한으로만 막는다
export const SHOT_DIFF = 12
export const SHOT_PER_MIN = 2
export const SHOT_MAX_W = 1280 // 저장 캡처 최대 폭(px)
export const SHOT_QUALITY = 0.7 // JPEG 품질
export const MAX_SHOT_BYTES = 600_000 // 서버 상한(1280px JPEG 0.7 은 보통 100~300KB)
export const SEG_PAGE = 50 // 전체 기록 한 쪽 줄 수(설계서 15.9)
export const MAX_SHOTS_LIST = 120 // 회의록 화면 캡처 목록 상한(분당 2장 × 1시간)
export const MAX_MD_SEGS = 5000 // Markdown 내려받기 조각 상한

export const NOTE_STS = ['RECORDING', 'SUMMARIZING', 'DONE', 'FAILED'] as const
export type NoteSts = (typeof NOTE_STS)[number]

// RGBA 두 프레임의 평균 밝기 차이(0~255). 길이가 다르면 255(완전히 다른 화면)
export function frameDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || a.length < 4) return 255
  let sum = 0
  const n = a.length / 4
  for (let i = 0; i < a.length; i += 4) {
    const la = a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114
    const lb = b[i] * 0.299 + b[i + 1] * 0.587 + b[i + 2] * 0.114
    sum += Math.abs(la - lb)
  }
  return sum / n
}

// 최근 60초 안에 보낸 캡처가 상한 미만이면 true(sent = 보낸 시각들)
export function shotAllowed(
  sent: readonly number[],
  now: number,
  perMin = SHOT_PER_MIN,
): boolean {
  return sent.filter((t) => now - t < 60_000).length < perMin
}

// JPEG 머리(FF D8 FF) — 서버가 확장자·MIME 대신 바이트로 확인
export const isJpeg = (b: Uint8Array) =>
  b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff

// 엔진 app 'state' 의 d 에서 AI 기록 여부만 — {notes: boolean} 이 아니면 null(다른 기능의 state 는 무시, SIGNAL_API 3.6 받는 쪽 검사)
export function noteState(d: unknown): boolean | null {
  if (!d || typeof d !== 'object') return null
  const v = (d as { notes?: unknown }).notes
  return typeof v === 'boolean' ? v : null
}

// 회의록 화면 경로·절대 URL — .ics DESCRIPTION(SubAgent1)·메일 본문에 넣는다
export const notePath = (ntId: string) => `/notes/${ntId}`
export const noteUrl = (origin: string, locale: string, ntId: string) =>
  `${origin.replace(/\/$/, '')}/${locale}${notePath(ntId)}`

export type MdSeg = {
  at: string
  spk: string
  text: string | null
  shot: boolean
}
export type MdNote = {
  title: string
  start: string
  end: string | null
  summary: { points: string[]; decisions: string[]; todos: string[] } | null
}

// 시각 표시 HH:MM(UTC 기준 문자열을 받은 쪽 시간대로) — 서버 Markdown 은 tz 를 인자로 받는다
export function hhmm(iso: string, timeZone?: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone,
    }).format(new Date(iso))
  } catch {
    return iso.slice(11, 16)
  }
}

// Markdown — 제목·요약(요점·결정·할 일)·전체 기록(캡처 위치 포함). 라벨은 호출부가 언어별로 넘긴다
export function noteMarkdown(
  note: MdNote,
  segs: readonly MdSeg[],
  L: {
    points: string
    decisions: string
    todos: string
    transcript: string
    shot: string
  },
): string {
  const esc = (s: string) => s.replace(/\r?\n/g, ' ').trim()
  const out = [
    `# ${esc(note.title)}`,
    '',
    `${note.start}${note.end ? ` ~ ${note.end}` : ''}`,
    '',
  ]
  const list = (h: string, items: string[], box = false) => {
    if (!items.length) return
    out.push(
      `## ${h}`,
      '',
      ...items.map((i) => `- ${box ? '[ ] ' : ''}${esc(i)}`),
      '',
    )
  }
  if (note.summary) {
    list(L.points, note.summary.points)
    list(L.decisions, note.summary.decisions)
    list(L.todos, note.summary.todos, true)
  }
  out.push(`## ${L.transcript}`, '')
  for (const s of segs) {
    if (s.shot) out.push(`- ${s.at} [${L.shot}]`)
    else if (s.text?.trim())
      out.push(`- ${s.at} **${esc(s.spk) || '?'}** ${esc(s.text)}`)
  }
  return out.join('\n') + '\n'
}
