// engage-rules.ts 시험 — node src/lib/engage-rules.test.mjs (설문 입력·집계·출석 시간·CSV·refresh 신호)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  attendSec,
  beatStops,
  cleanPoll,
  cleanQuestion,
  csvCell,
  fmtDur,
  isOnline,
  parseRefresh,
  tally,
  toCsv,
} from './engage-rules.ts'

test('설문 입력 — 2~10개·중복·길이', () => {
  assert.deepEqual(cleanPoll(' 다음 주제? ', [' A', 'B ']), { q: '다음 주제?', opts: ['A', 'B'] })
  assert.equal(cleanPoll('q', ['A']), null)
  assert.equal(cleanPoll('q', Array.from({ length: 11 }, (_, i) => `o${i}`)), null)
  assert.equal(cleanPoll('q', ['A', 'a']), null) // 대소문자만 다른 중복
  assert.equal(cleanPoll('q', ['A', '  ']), null)
  assert.equal(cleanPoll('', ['A', 'B']), null)
  assert.equal(cleanPoll('x'.repeat(501), ['A', 'B']), null)
  assert.equal(cleanPoll('q', ['x'.repeat(201), 'B']), null)
  assert.equal(cleanPoll('q', 'A,B'), null)
})

test('질문 입력', () => {
  assert.equal(cleanQuestion('  왜요? '), '왜요?')
  assert.equal(cleanQuestion(' '), null)
  assert.equal(cleanQuestion('x'.repeat(501)), null)
  assert.equal(cleanQuestion(3), null)
})

test('설문 집계 — 순서 유지·0표 채움·비율', () => {
  const opts = [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
    { id: 'c', text: 'C' },
  ]
  const r = tally(opts, { a: 9, b: 4, c: 7 })
  assert.deepEqual(r.map((x) => [x.id, x.n, x.pct]), [['a', 9, 45], ['b', 4, 20], ['c', 7, 35]])
  assert.deepEqual(tally(opts, {}).map((x) => x.pct), [0, 0, 0])
  assert.deepEqual(tally(opts, { b: 1 }).map((x) => x.n), [0, 1, 0])
})

test('출석 시간·접속 판정', () => {
  assert.equal(attendSec('2026-10-27T10:00:00Z', '2026-10-27T11:02:30Z'), 3750)
  assert.equal(attendSec('2026-10-27T10:00:00Z', '2026-10-27T09:00:00Z'), 0)
  assert.equal(attendSec('bad', '2026-10-27T09:00:00Z'), 0)
  assert.equal(fmtDur(3750), '1:02:30')
  assert.equal(fmtDur(303), '5:03')
  assert.equal(fmtDur(0), '0:00')
  const now = Date.parse('2026-10-27T10:05:00Z')
  assert.equal(isOnline('2026-10-27T10:04:00Z', now), true)
  assert.equal(isOnline('2026-10-27T10:02:00Z', now), false)
})

test('CSV — 따옴표·수식 주입·BOM', () => {
  assert.equal(csvCell('a,b'), '"a,b"')
  assert.equal(csvCell('say "hi"'), '"say ""hi"""')
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`)
  assert.equal(csvCell('-1'), "'-1")
  assert.equal(csvCell(null), '')
  assert.equal(toCsv([['이름', '분'], ['김', 3]]), '﻿이름,분\r\n김,3\r\n')
})

test('refresh 신호 모양', () => {
  assert.deepEqual(parseRefresh({ what: 'polls', kind: 'new' }), { what: 'polls', isNew: true })
  assert.deepEqual(parseRefresh({ what: 'qna' }), { what: 'qna', isNew: false })
  assert.equal(parseRefresh({ what: 'chat' }), null)
  assert.equal(parseRefresh('polls'), null)
  assert.equal(parseRefresh(null), null)
})

test('하트비트 중단 — 다시 보내도 같은 거절만', () => {
  for (const s of [402, 404, 409]) assert.equal(beatStops(s), true)
  for (const s of [0, 200, 401, 429, 500, 503]) assert.equal(beatStops(s), false)
})
