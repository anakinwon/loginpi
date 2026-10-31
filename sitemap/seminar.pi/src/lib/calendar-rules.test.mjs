// calendar-rules.ts 시험 — node --test src/lib/calendar-rules.test.mjs (Node 24 는 .ts 를 타입 제거로 바로 읽는다)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildIcs,
  calendarUrl,
  canCopy,
  canShare,
  copyText,
  shareLink,
  foldLine,
  icsEscape,
  icsNotesLabel,
  icsSeq,
  inViewerTz,
  mailtoUrl,
  openExternal,
  utcStamp,
  ZONED,
  viewerTz,
  webMailUrl,
} from './calendar-rules.ts'

const ev = {
  id: '11111111-2222-3333-4444-555555555555',
  title: '파이 세미나; 1부, 입문\\심화',
  startAt: '2026-10-27T05:00:00.000Z',
  url: 'https://seminar.example/s/11111111-2222-3333-4444-555555555555',
}

test('UTC 기본형', () => {
  assert.equal(utcStamp(new Date(ev.startAt)), '20261027T050000Z')
})

test('캘린더 추가 링크 — 시작·종료(1시간)·딥링크', () => {
  const u = new URL(calendarUrl(ev))
  assert.equal(u.searchParams.get('action'), 'TEMPLATE')
  assert.equal(u.searchParams.get('dates'), '20261027T050000Z/20261027T060000Z')
  assert.equal(u.searchParams.get('text'), ev.title)
  assert.equal(u.searchParams.get('location'), ev.url)
})

test('메일 링크 — 웹 작성·mailto 인코딩', () => {
  const u = new URL(webMailUrl('제목 & 1', '본문\n줄'))
  assert.equal(u.searchParams.get('su'), '제목 & 1')
  assert.equal(u.searchParams.get('body'), '본문\n줄')
  const m = mailtoUrl('a b+c', 'x&y')
  assert.equal(m, 'mailto:?subject=a%20b%2Bc&body=x%26y')
})

test('TEXT 이스케이프', () => {
  assert.equal(icsEscape('a;b,c\\d\ne'), 'a\\;b\\,c\\\\d\\ne')
})

test('TEXT 이스케이프 — 단독 \\r·CRLF·제어문자(주입 차단), TAB 보존', () => {
  assert.equal(icsEscape('a\rb'), 'a\\nb')
  assert.equal(icsEscape('a\r\nb'), 'a\\nb')
  assert.equal(icsEscape('a\u0000b\u001Fc\u007Fd\te'), 'abcd\te')
  for (const s of [icsEscape('x\rATTENDEE:mailto:evil@x'), icsEscape('y\u0000\u000B\u000C')])
    assert.ok(!/[\u0000-\u0008\u000A-\u001F\u007F]/.test(s))
})

test('.ics — 제목에 \\rATTENDEE 를 넣어도 새 속성 줄이 생기지 않는다', () => {
  const ics = buildIcs({ ...ev, title: 'T\rATTENDEE:mailto:evil@x\u0000', url: ev.url + '\r\nX-EVIL:1' })
  // 줄 구분은 CRLF 뿐(단독 \r·\n 없음), 펼친 뒤 ATTENDEE·X-EVIL 로 시작하는 줄 없음
  assert.ok(!/\r(?!\n)|(?<!\r)\n/.test(ics))
  const lines = ics.replace(/\r\n /g, '').split('\r\n')
  assert.ok(!lines.some((l) => /^(ATTENDEE|X-EVIL)/.test(l)))
  assert.ok(lines.includes('SUMMARY:T\\nATTENDEE:mailto:evil@x'))
})

// 결함 T01 r6 : NEL(U+0085)·U+2028·2029 가 통과 — 범용 줄 나누기(유니코드 줄 경계) 파서에선 새 속성 줄이 된다
test('.ics·메일 — NEL·U+2028·2029·C1 제어문자로도 속성 줄·머리줄을 끼워 넣지 못한다', () => {
  assert.equal(icsEscape('a\u0085b\u2028c\u2029d'), 'a\\nb\\nc\\nd')
  assert.equal(icsEscape('a\u0080b\u009Fc d'), 'abc d')
  const ics = buildIcs({ ...ev, title: 'T\u0085ATTENDEE:x\u2028X-EVIL:1', url: ev.url + '\u2029X-EVIL:2' })
  // 유니코드 줄 경계 전부로 나눠도(접힘 펼친 뒤) 주입 줄 없음
  const lines = ics.replace(/\r\n /g, '').split(/\r\n|[\r\n\u0085\u2028\u2029]/)
  assert.ok(!lines.some((l) => /^(ATTENDEE|X-EVIL)/.test(l)))
  assert.ok(!/[\u0080-\u009F\u2028\u2029]/.test(ics))
  const m = mailtoUrl('a\u0085Bcc: x\u2028y', 'b')
  assert.ok(m.startsWith('mailto:?subject=a%20Bcc%3A%20x%20y&'))
  assert.equal(new URL(webMailUrl('a\u2029b', 'c')).searchParams.get('su'), 'a b')
})

// 보강 T01 r6 : 기기 공유 시트(Web Share) — 기능 탐지, 닫기는 실패로 보지 않는다, navigator 를 this 로 호출
test('앱으로 공유 — 성공·사용자 닫기(cancel)·거부·미지원', async () => {
  const nav = {
    got: null,
    async share(d) {
      assert.equal(this, nav) // 메서드 호출(this 잃으면 브라우저가 Illegal invocation)
      this.got = d
    },
  }
  assert.equal(await shareLink({ title: 't', url: 'u1' }, nav), 'ok')
  assert.deepEqual(nav.got, { title: 't', url: 'u1' })
  const abort = Object.assign(new Error('x'), { name: 'AbortError' })
  assert.equal(await shareLink({ url: 'u' }, { share: async () => { throw abort } }), 'cancel')
  assert.equal(await shareLink({ url: 'u' }, { share: async () => { throw new Error('NotAllowed') } }), 'fail')
  assert.equal(await shareLink({ url: 'u' }, {}), 'fail')
  assert.equal(await shareLink({ url: 'u' }, undefined), 'fail')
  assert.equal(canShare({}), false)
})

test('공유 줄 — 앱으로 공유 문구 ko·en 동시', async () => {
  const { readFile } = await import('node:fs/promises')
  for (const l of ['ko', 'en']) {
    const s = JSON.parse(await readFile(new URL(`../../messages/${l}.json`, import.meta.url), 'utf8')).seminar.share
    assert.ok(s.share && s.shareFail, l)
  }
})

test('링크 복사 — 성공·거부·클립보드 없음', async () => {
  let got = ''
  assert.equal(await copyText('u1', { writeText: async (s) => void (got = s) }), true)
  assert.equal(got, 'u1')
  assert.equal(await copyText('u2', { writeText: async () => { throw new Error('denied') } }), false)
  assert.equal(await copyText('u3', undefined), false)
  assert.equal(canCopy({}), false)
})

test('줄접기 — 75 옥텟 이하·UTF-8 글자 보존', () => {
  const line = 'SUMMARY:' + '가'.repeat(60)
  const folded = foldLine(line)
  const parts = folded.split('\r\n')
  assert.ok(parts.length > 1)
  for (const p of parts) assert.ok(new TextEncoder().encode(p).length <= 75)
  assert.equal(parts.map((p, i) => (i ? p.slice(1) : p)).join(''), line)
  assert.equal(foldLine('short'), 'short')
})

test('.ics — UID·CRLF·회의록 링크·취소 상태', () => {
  const now = new Date('2026-10-01T00:00:00Z')
  const ics = buildIcs({ ...ev, notesUrl: 'https://seminar.example/notes/n1' }, now)
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'))
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'))
  assert.ok(!/[^\r]\n/.test(ics))
  const flat = ics.replace(/\r\n /g, '')
  assert.match(flat, /UID:11111111-2222-3333-4444-555555555555@seminar\.pi/)
  assert.match(flat, /DTSTAMP:20261001T000000Z/)
  assert.match(flat, /DTEND:20261027T060000Z/)
  assert.match(flat, /SUMMARY:파이 세미나\\; 1부\\, 입문\\\\심화/)
  assert.match(flat, /DESCRIPTION:.*\\nNotes: https:\/\/seminar\.example\/notes\/n1/)
  assert.match(flat, /STATUS:CONFIRMED/)
  assert.match(buildIcs({ ...ev, canceled: true }), /STATUS:CANCELLED/)
})

test('.ics — 시작 10분 전 알림(VEVENT 안), 취소 일정엔 없음, 알림 문구도 주입 차단', () => {
  const ics = buildIcs({ ...ev, title: 'A\rATTENDEE:x' })
  const lines = ics.replace(/\r\n /g, '').split('\r\n')
  const a = lines.indexOf('BEGIN:VALARM')
  assert.ok(a > lines.indexOf('BEGIN:VEVENT') && lines.indexOf('END:VALARM') < lines.indexOf('END:VEVENT'))
  assert.ok(lines.includes('TRIGGER:-PT10M'))
  assert.ok(lines.includes('DESCRIPTION:A\\nATTENDEE:x'))
  assert.ok(!lines.some((l) => l.startsWith('ATTENDEE')))
  assert.ok(!buildIcs({ ...ev, canceled: true }).includes('VALARM'))
})

// E2E r2 : 배포본(서버 UTC)에서 시작일시가 UTC 로 보이던 결함 — 표시 옵션에 보는 사람 시간대를 명시한다
test('보는 사람 시간대 — 서버 UTC 와 무관하게 KST 로 표시', () => {
  const d = new Date('2026-10-27T16:21:00.000Z') // 2026-10-28 01:21 KST
  const o = inViewerTz({ dateStyle: 'medium', timeStyle: 'short' }, 'Asia/Seoul')
  assert.equal(o.timeZone, 'Asia/Seoul')
  assert.equal(o.dateStyle, 'medium')
  const s = new Intl.DateTimeFormat('ko', o).format(d)
  assert.match(s, /28/)
  assert.match(s, /1:21/) // 오전/AM 표기는 ICU 데이터마다 다름
  // 기본값 = 실행 환경 시간대(브라우저에선 사용자 시간대)
  assert.equal(inViewerTz({}).timeZone, viewerTz())
})

// 보강 r3 : 메일 초대 본문 일시에 시간대 이름 — 다른 시간대 받는 사람이 오독하지 않게(dateStyle 혼용 RangeError 없음)
test('메일 일시 — 시간대 이름 포함', () => {
  const d = new Date('2026-10-27T16:21:00.000Z')
  const ko = new Intl.DateTimeFormat('ko', inViewerTz(ZONED, 'Asia/Seoul')).format(d)
  assert.match(ko, /28/)
  assert.match(ko, /GMT\+9|KST/)
  const en = new Intl.DateTimeFormat('en', inViewerTz(ZONED, 'America/New_York')).format(d)
  assert.match(en, /Oct 27/)
  assert.match(en, /EDT|GMT-4/)
})

// 결함 T01 r4 : mailto 본문 줄바꿈이 %0A 단독(RFC 6068 5절은 %0D%0A), 메일 제목에 제목의 줄바꿈·제어문자가 그대로 들어감
test('메일 — mailto 본문 줄바꿈은 %0D%0A, 제목 줄바꿈·제어문자는 공백', () => {
  const m = mailtoUrl('a\r\nBcc: x\u0000', '1\n2\r3\r\n4')
  assert.equal(m, 'mailto:?subject=a%20Bcc%3A%20x%20&body=1%0D%0A2%0D%0A3%0D%0A4')
  const u = new URL(webMailUrl('a\nb', '1\n2'))
  assert.equal(u.searchParams.get('su'), 'a b')
  assert.equal(u.searchParams.get('body'), '1\n2')
})

// 보강 T01 r4 : 시각 변경·취소 뒤 다시 받은 .ics 를 캘린더 앱이 새 개정으로 반영하도록 SEQUENCE·LAST-MODIFIED
test('.ics — SEQUENCE·LAST-MODIFIED 는 변경일시에서, 늦은 변경이 더 크다', () => {
  assert.equal(icsSeq(null), 0)
  assert.equal(icsSeq('bad'), 0)
  assert.ok(icsSeq('2026-10-28T01:00:01Z') > icsSeq('2026-10-28T01:00:00Z'))
  const ics = buildIcs({ ...ev, modAt: '2026-10-28T01:02:03.456Z' }, new Date(ev.startAt))
  assert.match(ics, /\r\nSEQUENCE:1793149323\r\n/)
  assert.match(ics, /\r\nLAST-MODIFIED:20261028T010203Z\r\n/)
  const old = buildIcs(ev, new Date(ev.startAt))
  assert.match(old, /\r\nSEQUENCE:0\r\n/)
  assert.ok(!old.includes('LAST-MODIFIED'))
})

test('.ics — UID 는 대소문자와 무관하게 같다(대문자 UUID 주소로 받아도 같은 일정)', () => {
  const now = new Date('2026-10-01T00:00:00Z')
  const lower = buildIcs(ev, now)
  const upper = buildIcs({ ...ev, id: ev.id.toUpperCase() }, now)
  const uid = (s) => s.match(/^UID:[^\r]*/m)[0]
  assert.equal(uid(upper), uid(lower))
  assert.equal(uid(lower), `UID:${ev.id}@seminar.pi`)
})

test('.ics — 회의록 라벨은 ?hl 언어별, 모르는 값·없음 = 영어', () => {
  assert.equal(icsNotesLabel('ko'), '회의록')
  assert.equal(icsNotesLabel('en'), 'Notes')
  assert.equal(icsNotesLabel('xx'), 'Notes')
  assert.equal(icsNotesLabel(null), 'Notes')
  assert.equal(icsNotesLabel('__proto__'), 'Notes')
  const ics = buildIcs({ ...ev, notesUrl: 'https://seminar.example/notes/n1', notesLabel: icsNotesLabel('ko') })
  assert.match(ics.replace(/\r\n /g, ''), /DESCRIPTION:.*\\n회의록: https:\/\/seminar\.example\/notes\/n1/)
})

test('공유 칸 — 고정 높이 대신 min-h(글자 확대·360px 줄접힘), .ics 링크에 언어 전달', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../components/seminar/share-links.tsx', import.meta.url), 'utf8')
  assert.match(src, /'[^']*\bmin-h-10\b[^']*'/)
  assert.ok(!/'[^'\n]*[\s']h-10\b/.test(src))
  assert.match(src, /\/ics\?hl=/)
})

// ── Pi Browser 대안(F-08) — Pi SDK 유틸은 주입(pi), 없으면 브라우저 기본 동작 ──
const never = () => new Promise(() => {})

test('openExternal — 유틸 없음·일반 브라우저 = null(앵커 기본 동작), 성공 ok, reject·무반응 fail', async () => {
  assert.equal(openExternal('https://x', undefined), null)
  assert.equal(openExternal('https://x', {}), null)
  const got = []
  assert.equal(await openExternal('https://x', { openUrlInSystemBrowser: async (u) => void got.push(u) }), 'ok')
  assert.deepEqual(got, ['https://x'])
  assert.equal(await openExternal('https://x', { openUrlInSystemBrowser: () => Promise.reject(new Error('No minimal requirements')) }), 'fail')
  assert.equal(await openExternal('https://x', { openUrlInSystemBrowser: never }, 20), 'fail')
})

test('copyText — Pi.copyText 우선, reject 면 clipboard 폴백, 둘 다 없으면 false(기존 경로 회귀)', async () => {
  const clipGot = []
  const clip = { writeText: async (s) => void clipGot.push(s) }
  const piGot = []
  assert.equal(await copyText('a', clip, { copyText: async (s) => void piGot.push(s) }), true)
  assert.deepEqual([piGot, clipGot], [['a'], []])
  assert.equal(await copyText('b', clip, { copyText: () => Promise.reject(new Error('x')) }), true)
  assert.deepEqual(clipGot, ['b'])
  assert.equal(await copyText('c', undefined, { copyText: () => Promise.reject(new Error('x')) }), false)
  assert.equal(await copyText('d', clip, undefined), true)
  assert.equal(canCopy(undefined, { copyText: async () => {} }), true)
  assert.equal(canCopy(undefined, {}), false)
  assert.equal(canCopy(clip, {}), true)
})

test('shareLink — Pi.openShareDialog(제목, 본문+링크) 우선·void 반환도 ok, throw 는 fail, 없으면 Web Share 경로', async () => {
  let got = null
  assert.equal(await shareLink({ title: 'T', text: '본문', url: 'https://x' }, undefined, { openShareDialog: (t, m) => void (got = [t, m]) }), 'ok')
  assert.deepEqual(got, ['T', '본문\nhttps://x'])
  assert.equal(await shareLink({ url: 'https://x' }, undefined, { openShareDialog: async (t, m) => void (got = [t, m]) }), 'ok')
  assert.deepEqual(got, ['', 'https://x'])
  assert.equal(await shareLink({ url: 'https://x' }, undefined, { openShareDialog: () => { throw new Error('x') } }), 'fail')
  assert.equal(await shareLink({ url: 'https://x' }, { share: async () => {} }, {}), 'ok')
  assert.equal(await shareLink({ url: 'https://x' }, undefined, {}), 'fail')
  assert.equal(canShare(undefined, { openShareDialog: () => {} }), true)
  assert.equal(canShare(undefined, {}), false)
})
