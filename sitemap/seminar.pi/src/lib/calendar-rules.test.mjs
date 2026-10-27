// calendar-rules.ts 시험 — node --test src/lib/calendar-rules.test.mjs (Node 24 는 .ts 를 타입 제거로 바로 읽는다)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildIcs,
  calendarUrl,
  canCopy,
  copyText,
  foldLine,
  icsEscape,
  mailtoUrl,
  utcStamp,
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
