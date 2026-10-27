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
  modAt?: string | null // 마지막 변경(smn_mst.mod_dtm) — .ics SEQUENCE·LAST-MODIFIED
  notesLabel?: string // 설명의 회의록 라벨(언어별)
}

// .ics 설명의 회의록 라벨 — 공개 라우트라 세션 언어가 없어 화면이 ?hl= 로 넘긴다. 모르는 값 = 영어
const NOTES_LABEL: Record<string, string> = { ko: '회의록', en: 'Notes' }
export const icsNotesLabel = (hl?: string | null) => (hl && Object.hasOwn(NOTES_LABEL, hl) ? NOTES_LABEL[hl] : NOTES_LABEL.en)

// 개정 번호(RFC 5545 3.8.7.4) — 같은 UID 를 다시 받을 때 캘린더 앱이 번호가 큰 쪽(시각 변경·취소)을 반영한다. 변경일시 초 단위라 늘기만 한다
// ponytail: 초 단위 epoch, 2038 년에 int32 를 넘음 — 그 전에 개정 칼럼으로
export const icsSeq = (modAt?: string | null) => {
  const t = modAt ? Date.parse(modAt) : NaN
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0
}

// 보는 사람의 시간대 — next-intl useFormatter 는 서버(배포본 = UTC) 시간대를 물려받으므로 화면 표시엔 이 값을 명시한다(E2E r2)
export const viewerTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone
export const inViewerTz = <const T extends object>(o: T, tz = viewerTz()) => ({ ...o, timeZone: tz })
// 남에게 보내는 글(메일 초대)의 일시 — 받는 사람은 다른 시간대일 수 있어 시간대 이름(GMT+9 등)을 붙인다.
//  dateStyle·timeStyle 은 timeZoneName 과 같이 쓰면 RangeError 라 칸별로 적는다
export const ZONED = { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' } as const

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

// 메일 제목은 한 줄 — 제목 칸에 줄바꿈·제어문자가 들어가면 머리줄이 깨진다(기존 행 대비, 새 제목은 ONE_LINE_RE 로 막음)
//  C1 제어문자(U+0080~009F, NEL 포함)·줄/문단 구분자(U+2028·2029)도 줄바꿈으로 읽는 처리기가 있어 같이 공백으로
const oneLine = (s: string) => s.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g, ' ')

// 웹 메일 작성 링크(받는 사람 비움 — 보내는 사람이 고른다)
export function webMailUrl(subject: string, body: string) {
  const q = new URLSearchParams({ view: 'cm', fs: '1', su: oneLine(subject), body })
  return `https://mail.google.com/mail/?${q}`
}

// 기본 메일 앱 — mailto 는 + 를 공백으로 읽지 않으므로 encodeURIComponent, 본문 줄바꿈은 %0D%0A(RFC 6068 5절)
export const mailtoUrl = (subject: string, body: string) =>
  `mailto:?subject=${encodeURIComponent(oneLine(subject))}&body=${encodeURIComponent(body.replace(/\r\n|\r|\n/g, '\r\n'))}`

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

// 기기 공유 시트(Web Share) — 메신저 등 설치 앱으로 바로 보낸다(메일·클립보드가 막힌 WebView 의 대안). 기능 탐지(UA 판정 아님).
//  'cancel' = 사용자가 시트를 닫음(안내 없음), 'fail' = 미지원·거부(화면이 링크 복사로 안내)
type Sharer = { share?: (d: { title?: string; text?: string; url?: string }) => Promise<void> } | undefined
export const canShare = (nav: Sharer = globalThis.navigator) => typeof nav?.share === 'function'
export async function shareLink(d: { title?: string; text?: string; url: string }, nav: Sharer = globalThis.navigator) {
  if (!canShare(nav)) return 'fail' as const
  try {
    await nav!.share!(d)
    return 'ok' as const
  } catch (e) {
    return (e as { name?: string } | null)?.name === 'AbortError' ? ('cancel' as const) : ('fail' as const)
  }
}

// 제어문자(TAB 제외 U+0000~001F·U+007F~009F)·줄/문단 구분자(U+2028·2029) 제거 — 단독 \r·NEL 등이 줄을 끊어 속성(ATTENDEE 등)을 끼워 넣지 못하게
//  (NEL·U+2028 을 줄바꿈으로 보는 범용 줄 나누기 파서가 있다)
const stripCtl = (s: string) => s.replace(/[\u0000-\u0008\u000A-\u001F\u007F-\u009F\u2028\u2029]/g, '')

// TEXT 값 이스케이프(RFC 5545 3.3.11) — \ ; , 줄바꿈. 줄바꿈(\r\n·\r·\n·NEL·U+2028·2029)을 먼저 \n 으로 바꾸고 남은 제어문자 제거
export const icsEscape = (s: string) =>
  stripCtl(
    s
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n|[\r\n\u0085\u2028\u2029]/g, '\\n'),
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
    // UID 는 소문자로 고정 — 대문자 UUID 주소로 받아도 같은 일정으로 갱신되게(다르면 캘린더에 일정이 둘 생김)
    `UID:${e.id.toLowerCase()}@seminar.pi`,
    `DTSTAMP:${utcStamp(now)}`,
    `SEQUENCE:${icsSeq(e.modAt)}`,
    ...(icsSeq(e.modAt) ? [`LAST-MODIFIED:${utcStamp(new Date(e.modAt!))}`] : []),
    `DTSTART:${utcStamp(s)}`,
    `DTEND:${utcStamp(en)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    `DESCRIPTION:${icsEscape(describe(e, e.notesLabel))}`,
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
