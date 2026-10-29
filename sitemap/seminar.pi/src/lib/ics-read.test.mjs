// 내 Google 일정(iCal) 읽기 시험 — node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { icsLabel, icsUrlOk, parseIcs } from './ics-read.ts'

test('주소 — Google 비공개 iCal 만(SSRF 방지)', () => {
  assert.equal(icsUrlOk('https://calendar.google.com/calendar/ical/abc%40gmail.com/private-xyz/basic.ics'), true)
  assert.equal(icsUrlOk('http://calendar.google.com/calendar/ical/a/basic.ics'), false)
  assert.equal(icsUrlOk('https://calendar.google.com.evil.io/calendar/ical/a/basic.ics'), false)
  assert.equal(icsUrlOk('https://169.254.169.254/latest/meta-data'), false)
  assert.equal(icsUrlOk('https://calendar.google.com/calendar/u/0/r'), false)
})

test('해석 — 종일·UTC·TZID, 접힌 줄, 기간 밖 제외, 시작 순', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261105', 'SUMMARY:창립 기념일', 'END:VEVENT',
    'BEGIN:VEVENT', 'DTSTART:20261103T010000Z', 'DTEND:20261103T020000Z', 'SUMMARY:주간 회의\, 팀', 'END:VEVENT',
    'BEGIN:VEVENT', 'DTSTART;TZID=Asia/Seoul:20261110T140000', 'SUMMARY:긴 제목이', ' 접혀 있음', 'END:VEVENT',
    'BEGIN:VEVENT', 'DTSTART:20261201T000000Z', 'SUMMARY:다음 달', 'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const ev = parseIcs(ics, '2026-11-01', '2026-11-30')
  assert.deepEqual(ev.map((e) => e.title), ['주간 회의, 팀', '창립 기념일', '긴 제목이접혀 있음'])
  assert.equal(ev[1].allDay, true)
  assert.equal(ev[0].start, '2026-11-03T01:00:00Z')
})

test('장소·캘린더 이름 — LOCATION 은 있을 때만, 이름은 주소의 캘린더 ID(비밀 부분 제외)', () => {
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20261101T010000Z\r\nSUMMARY:회의\r\nLOCATION:서울\, 강남\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261102\r\nSUMMARY:휴일\r\nEND:VEVENT\r\nEND:VCALENDAR'
  const [a, b] = parseIcs(ics, '2026-11-01', '2026-11-30')
  assert.equal(a.place, '서울, 강남')
  assert.equal('place' in b, false)
  assert.equal(icsLabel('https://calendar.google.com/calendar/ical/a.b%40gmail.com/private-xyz/basic.ics'), 'a.b@gmail.com')
  assert.equal(icsLabel('not a url'), '')
})
