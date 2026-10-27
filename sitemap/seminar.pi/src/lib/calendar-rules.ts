// 일정·공유 순수 규칙(계획 SA1, M-2 OAuth 없는 링크) — 캘린더 추가 링크·웹 메일 작성 링크·mailto·.ics(RFC 5545) 생성.
// 서버·클라이언트 공용(server-only 없음). 시험 : node --test src/lib/calendar-rules.test.mjs (Node 24 타입 제거로 .ts 직접 읽음)

// 세미나에 예정 종료일시가 없다(smn_mst.end_dtm = 실제 종료) → 일정 길이는 1시간으로 둔다
// ponytail: 고정 1시간, 예정 종료일시 칼럼이 생기면 그 값으로
export const DEFAULT_DUR_MS = 60 * 60 * 1000
// .ics 시작 전 알림(분)
export const REMIND_MIN = 10

export interface CalEvent {
  id: string // smn_id — .ics UID
  title: string
  startAt: string // ISO
  url: string // 상세 딥링크(원클릭 참여)
  notesUrl?: string | null // 회의록이 있으면 링크
  canceled?: boolean
}

// 2026-10-27T05:00:00.000Z → 20261027T050000Z (UTC 기본형)
export const utcStamp = (d: Date) =>
  d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

const range = (e: CalEvent) => {
  const start = new Date(e.startAt)
  return [start, new Date(start.getTime() + DEFAULT_DUR_MS)] as const
}

// 설명 본문 — 링크 + (있으면) 회의록 링크. 줄바꿈은 각 형식이 알아서 처리
export const describe = (e: CalEvent, notesLabel = 'Notes') =>
  [e.url, e.notesUrl ? `${notesLabel}: ${e.notesUrl}` : null]
    .filter(Boolean)
    .join('\n')

// 캘린더 추가(TEMPLATE) 링크 — 로그인·API 키 없이 열리는 공개 작성 화면
export function calendarUrl(e: CalEvent) {
  const [s, en] = range(e)
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${utcStamp(s)}/${utcStamp(en)}`,
    details: describe(e),
    location: e.url,
  })
  return `https://calendar.google.com/calendar/render?${q}`
}

// 웹 메일 작성 링크(받는 사람 비움 — 보내는 사람이 고른다)
export function webMailUrl(subject: string, body: string) {
  const q = new URLSearchParams({ view: 'cm', fs: '1', su: subject, body })
  return `https://mail.google.com/mail/?${q}`
}

// 기본 메일 앱 — mailto 는 + 를 공백으로 읽지 않으므로 encodeURIComponent(RFC 6068)
export const mailtoUrl = (subject: string, body: string) =>
  `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

// 링크 복사 — 외부 링크·mailto 가 안 열리는 환경(Pi Browser [확인중 : 실기기])의 대안. 클립보드 없음·거부 = false(화면이 안내)
type Clip = { writeText: (s: string) => Promise<void> } | undefined
export const canCopy = (clip: Clip = globalThis.navigator?.clipboard) => typeof clip?.writeText === 'function'
export async function copyText(text: string, clip: Clip = globalThis.navigator?.clipboard) {
  if (!canCopy(clip)) return false
  try {
    await clip!.writeText(text)
    return true
  } catch {
    return false
  }
}

// 제어문자(TAB 제외 U+0000~001F·U+007F) 제거 — 단독 \r 등이 줄을 끊어 속성(ATTENDEE 등)을 끼워 넣지 못하게
// eslint-disable-next-line no-control-regex
const stripCtl = (s: string) => s.replace(/[\u0000-\u0008\u000A-\u001F\u007F]/g, '')

// TEXT 값 이스케이프(RFC 5545 3.3.11) — \ ; , 줄바꿈. 줄바꿈 3종(\r\n·\r·\n)을 먼저 \n 으로 바꾸고 남은 제어문자 제거
export const icsEscape = (s: string) =>
  stripCtl(
    s
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n|\r|\n/g, '\\n'),
  )

// 줄접기(RFC 5545 3.1) — 75 옥텟 넘으면 CRLF + 공백. UTF-8 글자 중간을 자르지 않는다
export function foldLine(line: string) {
  const enc = new TextEncoder()
  const out: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    // 이어지는 줄은 앞 공백 1옥텟 포함 75
    if (bytes + n > 75) {
      out.push(cur)
      cur = ' '
      bytes = 1
    }
    cur += ch
    bytes += n
  }
  out.push(cur)
  return out.join('\r\n')
}

export function buildIcs(e: CalEvent, now = new Date()) {
  const [s, en] = range(e)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//seminar.pi//seminar//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.id}@seminar.pi`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(s)}`,
    `DTEND:${utcStamp(en)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    `DESCRIPTION:${icsEscape(describe(e))}`,
    `LOCATION:${icsEscape(e.url)}`,
    `URL:${stripCtl(e.url)}`,
    `STATUS:${e.canceled ? 'CANCELLED' : 'CONFIRMED'}`,
    // 시작 전 알림(RFC 5545 3.6.6) — 지원하는 캘린더 앱이 울린다(무시하는 앱도 있음). 취소된 일정엔 넣지 않는다
    ...(e.canceled
      ? []
      : ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(e.title)}`, `TRIGGER:-PT${REMIND_MIN}M`, 'END:VALARM']),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(foldLine).join('\r\n') + '\r\n'
}
